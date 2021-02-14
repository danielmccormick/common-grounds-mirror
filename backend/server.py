#!/usr/bin/env python3
import asyncio
import json
import logging
import random
import re
from datetime import datetime
from enum import Enum

import aiohttp_cors
import firebase_admin
import requests
import openai
from aiohttp import WSMsgType, web
from firebase_admin import auth, credentials, firestore
from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VideoGrant
from twilio.rest import Client

from questions import QUESTIONS_LIST

logging.basicConfig()

logging.getLogger().setLevel(logging.INFO)

cred = credentials.Certificate(
    "REDACTED"
)
firebase_admin.initialize_app(cred)

db = firestore.client()
openai.api_key = "REDACTED"

IP_STACK_KEY = "REDACTED"

routes = web.RouteTableDef()

TWILIO_ACCOUNT_SID = "REDACTED"
TWILIO_AUTH_TOKEN = "REDACTED"
TWILIO_API_KEY_SID = "REDACTED"
TWILIO_API_KEY_SECRET = "REDACTED"
client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)


USER_TO_ROOM = {}
user_to_room_lock = asyncio.Lock()


USERS = {}  # maps currently connected uids to User objects
WEBSOCKET_TO_USER = {}  # maps currently connected websockets to User objects
users_lock = (
    asyncio.Lock()
)  # regulates concurrent access to USERS and WEBSOCKET_TO_USER

MATCHING_POOL = set()
matching_pool_lock = asyncio.Lock()


def get_username(display_name):
    name_parts = display_name.split()
    return f"{name_parts[0]} {name_parts[-1][0]}."


class User:
    def __init__(self, id_token, websocket, ip_address):
        self.websocket = websocket
        self.uid = authenticate_id_token(id_token)
        user = get_user(self.uid)
        self.photo_url = user.photo_url
        self.display_name = user.display_name
        self.username = get_username(self.display_name)
        self.first_name = self.display_name.split()[0]
        self.email = user.email
        self.questions = []

        # user_ref = db.collection(u'users').document(self.uid)

        # user = user_ref.get()
        # if user.exists:
        ipstack_resp = requests.get(
            f"http://api.ipstack.com/{ip_address}?access_key={IP_STACK_KEY}"
        ).json()
        print(ipstack_resp)
        db.collection("users").document(self.uid).set(
            {
                "city": ipstack_resp["city"],
                "region": ipstack_resp["region_name"],
                "country": ipstack_resp["country_name"],
                "country_emoji": ipstack_resp["location"]["country_flag_emoji"],
                "location": firestore.GeoPoint(
                    ipstack_resp["latitude"], ipstack_resp["longitude"]
                ),
                "name": self.display_name,
                "display_name": self.username,
                "photo_url": self.photo_url,
                "email": self.email,
                "last_online": firestore.SERVER_TIMESTAMP,
                "status": "online",
            }
        )

        db.collection("statuses").document(self.uid).set(
            {
                "status": "online",
                "last_online": firestore.SERVER_TIMESTAMP,
            }
        )

        self.db_ref = db.collection("users").document(self.uid)

    async def request_friend(self, other_user):
        friend_requests = (
            db.collection("friend_requests")
            .where("from", "==", other_user.uid)
            .where("to", "==", self.uid)
            .get()
        )

        print(friend_requests)

        if friend_requests:
            friends = (
                db.collection("friends")
                .where("from", "==", other_user.uid)
                .where("to", "==", self.uid)
                .get()
            )
            if not friends:
                db.collection("friends").add(
                    {
                        "from": self.uid,
                        "to": other_user.uid,
                    }
                )
                db.collection("friends").add(
                    {
                        "from": other_user.uid,
                        "to": self.uid,
                    }
                )
            for request in friend_requests:
                request.reference.delete()
        else:
            db.collection("friend_requests").add(
                {
                    "from": self.uid,
                    "to": other_user.uid,
                }
            )
            return

        users = [self, other_user]
        for user in users:
            await user.websocket.send_json(
                {"action": Action.SendFriendResult.value, "accepted": True}
            )

    async def reject_friend(self, other_user):
        for friend_request in (
            db.collection("friend_requests")
            .where("from", "==", other_user.uid)
            .where("to", "==", self.uid)
            .stream()
        ):
            friend_request.reference.delete()
        for friend_request in (
            db.collection("friend_requests")
            .where("to", "==", other_user.uid)
            .where("from", "==", self.uid)
            .stream
        ):
            friend_request.reference.delete()

        users = [self, other_user]
        for user in users:
            await user.websocket.send_json(
                {"action": Action.SendFriendResult.value, "accepted": False}
            )

    def __hash__(self):
        return hash(self.uid)

    def __repr__(self):
        return f"User(uid: {self.uid})"


class Room:
    def __init__(self, users, name):
        self.users = users
        self.joined_users = set()
        self.lock = asyncio.Lock()
        self.name = name
        try:
            self.room = client.video.rooms.create(
                type="go",
                unique_name=name,
            )
        except Exception as e:
            logging.error(e)
            self.room = client.video.rooms(name).fetch()

        self.prompts = self.generate_prompts()

        self.prompt_idx = 0
        self.user_prompt_idx = {
            self.users[0]: 0,
            self.users[1]: 0,
        }

    async def request_next_prompt(self, user):
        async with self.lock:
            if self.user_prompt_idx[user] != self.prompt_idx:
                return
            elif self.prompt_idx == len(self.prompts) - 1:
                return

            next_idx = self.user_prompt_idx[user] + 1
            self.user_prompt_idx[user] = next_idx

        if all(
            user_prompt_idx == next_idx
            for user_prompt_idx in self.user_prompt_idx.values()
        ):
            async with self.lock:
                self.prompt_idx = next_idx
            for user in self.users:
                await user.websocket.send_json(
                    {
                        "action": Action.SendPromptIndex.value,
                        "promptIndex": next_idx,
                    }
                )

    def get_twilio_token_for_user(self, user):
        token = AccessToken(
            TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET
        )
        token.identity = user.email
        grant = VideoGrant(room=self.name)
        token.add_grant(grant)
        return token.to_jwt().decode("utf-8")

    def generate_prompts(self):
        user_1 = self.users[0]
        user_2 = self.users[1]
        prompts = [
            {
                "id": None,
                "text": "Say hello!",
                "answers": {
                    user_1.uid: None,
                    user_2.uid: None,
                },
            }
        ]

        for question_idx in range(len(user_1.questions)):
            user_1_question_dict = user_1.questions[question_idx]
            user_2_question_dict = user_2.questions[question_idx]

            if user_1_question_dict["id"] == user_2_question_dict["id"]:
                prompts.append(
                    {
                        "id": user_1_question_dict["id"],
                        "text": user_1_question_dict["text"],
                        "answers": {
                            user_1.uid: user_1_question_dict["answer"],
                            user_2.uid: user_2_question_dict["answer"],
                        },
                    }
                )
            else:
                prompts.append(
                    {
                        "id": user_1_question_dict["id"],
                        "text": user_1_question_dict["text"],
                        "answers": {
                            user_1.uid: user_1_question_dict["answer"],
                            user_2.uid: None,
                        },
                    }
                )
                prompts.append(
                    {
                        "id": user_1_question_dict["id"],
                        "text": user_1_question_dict["text"],
                        "answers": {
                            user_1.uid: None,
                            user_2.uid: user_2_question_dict["answer"],
                        },
                    }
                )

        user_1_answers = "\n".join(
            [
                f"Question: {question['text']}\nAnswer: {question['answer']}"
                for question in user_1.questions
            ]
        )
        user_2_answers = "\n".join(
            [
                f"Question: {question['text']}\nAnswer: {question['answer']}"
                for question in user_2.questions
            ]
        )

        # prompt = f"Create 5 discussion prompts for Brian and Sam based on their answers to the following questions:\n\nBrian:\n{user_1_answers}\n\nSam:\n{user_2_answers}\n\n1."
        # print(prompt)

        prompt = f"Create 5 discussion prompts for Brian and Sam to talk about, based on their answers to the following questions.\n\nBrian:\n{user_1_answers}\n\nSam:\n{user_2_answers}\n\n1."
        print(prompt)

        open_ai_response = openai.Completion.create(
            engine="davinci-instruct-beta",
            # Must replace 'Brian' and 'Sam' with the user's names in response
            prompt=prompt,
            temperature=0.8,
            max_tokens=500,
            top_p=1,
            # frequency_penalty=0.1,
            frequency_penalty=0.5,
            presence_penalty=0.1,
            stop=["\n\n"],
        )
        print(open_ai_response.choices[0].text)

        open_ai_prompts = (
            re.sub(r"\n\d+\. ", "\n", open_ai_response.choices[0].text)
            .strip()
            .replace("Brian", user_1.username)
            .replace("Sam", user_2.username)
            .split("\n")
        )

        for prompt in open_ai_prompts:
            prompts.append(
                {
                    "id": None,
                    "text": prompt,
                    "answers": {
                        user_1.uid: None,
                        user_2.uid: None,
                    },
                }
            )

        print(prompts)

        return prompts

    def end(self):
        self.room.update(status="completed")


class Action(Enum):
    # Client -> Server messages
    Authenticate = "AUTHENTICATE"
    Heartbeat = "HEARTBEAT"
    SignOut = "SIGN_OUT"
    RequestQuestions = "REQUEST_QUESTIONS"
    SubmitAnswers = "SUBMIT_ANSWERS"
    CancelMatching = "CANCEL_MATCHING"
    JoinRoom = "JOIN_ROOM"
    RequestNextPrompt = "REQUEST_NEXT_PROMPT"
    RequestExtendTime = "REQUEST_EXTEND_TIME"
    LeaveRoom = "LEAVE_ROOM"
    DecideFriend = "DECIDE_FRIEND"
    CallFriend = "CALL_FRIEND"
    AcceptCall = "ACCEPT_CALL"
    RejectCall = "REJECT_CALL"

    # Server -> Client messages
    Initialize = "INITIALIZE"
    RejectAuthentication = "REJECT_AUTHENTICATION"
    SendQuestions = "SEND_QUESTIONS"
    FindingMatch = "FINDING_MATCH"
    SendMatch = "SEND_MATCH"
    SendPrompts = "SEND_PROMPTS"
    SendPromptIndex = "SEND_PROMPT_INDEX"
    SendFriendResult = "SEND_FRIEND_RESULT"
    SendCallRequest = "SEND_CALL_REQUEST"
    UpdateFriendStatus = "UPDATE_FRIEND_STATUS"


def authenticate_id_token(id_token):
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token["uid"]
    except Exception as e:
        logging.info(e)
        raise e


def get_user(uid):
    # https://firebase.google.com/docs/reference/admin/python/firebase_admin.auth#userrecord
    return auth.get_user(uid)


async def clean_up_user(websocket):
    user = None
    async with users_lock:
        if websocket in WEBSOCKET_TO_USER:
            user = WEBSOCKET_TO_USER.pop(websocket)
            user.db_ref.update(
                {"status": "offline", "last_online": firestore.SERVER_TIMESTAMP}
            )
            db.collection("statuses").document(user.uid).set(
                {
                    "status": "offline",
                    "last_online": firestore.SERVER_TIMESTAMP,
                }
            )
            if user in USERS:
                USERS.pop(user.uid)
            await websocket.close()
            return

    async with matching_pool_lock:
        if user and user in MATCHING_POOL:
            MATCHING_POOL.remove(user.uid)


@routes.get("/broadcast")
async def handle_broadcast(request):
    for ws in USERS.values():
        await ws.send_json({"msg": "BROADCAST"})
    return web.Response(text="Broadcast to all connected websockets.")


@routes.get("/debug_state")
async def handle_debug_state(request):
    async with users_lock:
        print("==== users:")
        print(USERS)
        print("==== websocket_to_user:")
        print(WEBSOCKET_TO_USER)
    async with user_to_room_lock:
        print("==== users_to_room:")
        print(USER_TO_ROOM)
    async with matching_pool_lock:
        print("==== matching_pool:")
        print(MATCHING_POOL)
    return web.Response(text="Printed debug state.")


@routes.get("/questions")
async def handle_questions(request):
    # This usually won't do much - default sets to nearest 10 minute interval in day (out of 144 10 minute intervals)
    QUESTIONS_LIST.pulse()
    return web.json_response(QUESTIONS_LIST.get_n_question_dict(3))


@routes.post("/remove_friend")
async def handle_remove_friend(request):
    data = await request.json()
    id_token = data["idToken"]
    other_user_uid = data["otherUserUid"]
    uid = authenticate_id_token(id_token)

    for friend in (
        db.collection("friends")
        .where("from", "==", other_user_uid)
        .where("to", "==", uid)
        .stream()
    ):
        friend.reference.delete()
    for friend in (
        db.collection("friends")
        .where("to", "==", other_user_uid)
        .where("from", "==", uid)
        .stream()
    ):
        friend.reference.delete()

    return web.json_response({"status": "ok"})


@routes.post("/twilio")
async def handle_twilio(request):
    # TODO: dynamically pick Qs based on time
    data = await request.json()
    uid = data["uid"]
    async with users_lock:
        user = USERS[uid]
    async with user_to_room_lock:
        room = USER_TO_ROOM[user]
    return web.json_response(
        {
            "accessToken": room.get_twilio_token_for_user(user),
        }
    )


@routes.get("/")
async def handle_websocket(request):
    try:
        websocket = web.WebSocketResponse()
        await websocket.prepare(request)

        async for msg in websocket:

            if msg.type == WSMsgType.ERROR:
                logging.error(
                    "websocket connection closed with exception %s"
                    % websocket.exception()
                )
                return

            if msg.type != WSMsgType.TEXT:
                logging.error("websocket message not TEXT %s" % websocket)
                return

            if msg.data == "close":
                async with users_lock:
                    if websocket in WEBSOCKET_TO_USER:
                        await clean_up_user(websocket)
                        await websocket.close()
                        return

            try:
                data = json.loads(msg.data)
            except Exception:
                logging.error(f"not valid JSON: {msg.data} from {request.remote}")
                continue

            if "action" not in data:
                logging.error("no action: {}".format(data))
                continue

            action = data["action"]
            if (
                action != Action.Authenticate.value
                and websocket not in WEBSOCKET_TO_USER
            ):  # not authenticated
                await clean_up_user(websocket)
                await websocket.send_json(
                    {
                        "action": Action.RejectAuthentication.value,
                    }
                )
                continue

            logging.info(f"{action} from {hash(websocket)}")

            if action == Action.Authenticate.value:
                id_token = data["idToken"]
                user = User(id_token, websocket, request.remote)
                async with users_lock:
                    USERS[user.uid] = user
                    WEBSOCKET_TO_USER[websocket] = user
                # print(data)
                print(user.display_name)
                print(user.uid)
                await websocket.send_json(
                    {
                        "action": Action.Initialize.value,
                    }
                )
            elif action == Action.Heartbeat.value:
                # uid = authenticate_id_token(id_token)
                # user = USERS[uid]
                # TODO: implement heartbeat?
                pass

            elif action == Action.SubmitAnswers.value:
                uid = data["uid"]
                print(data)
                other_user = None

                async with users_lock:
                    user = USERS[uid]

                user.questions = data["questions"]

                async with matching_pool_lock:
                    if user.uid in MATCHING_POOL:
                        MATCHING_POOL.remove(user.uid)
                    print(MATCHING_POOL)
                    if MATCHING_POOL:
                        # TODO: smarter matching
                        other_user = USERS[random.choice(list(MATCHING_POOL))]
                        MATCHING_POOL.remove(other_user.uid)
                    else:
                        MATCHING_POOL.add(user.uid)
                        continue

                room_name = user.uid + other_user.uid
                room = Room([user, other_user], room_name)
                users = [user, other_user]

                is_friend = (
                    len(
                        db.collection("friends")
                        .where("from", "==", other_user.uid)
                        .where("to", "==", user.uid)
                        .get()
                    )
                    > 0
                )

                for i, u in enumerate(users):
                    async with user_to_room_lock:
                        USER_TO_ROOM[u] = room
                    other_u = users[(i + 1) % len(users)]
                    await u.websocket.send_json(
                        {
                            "action": Action.SendMatch.value,
                            "roomName": room_name,
                            "twilioToken": room.get_twilio_token_for_user(u),
                            "otherUser": {
                                "username": other_u.username,
                                "uid": other_u.uid,
                                "isFriend": is_friend,
                            },
                        }
                    )

            elif action == Action.CancelMatching.value:
                uid = data["uid"]
                async with users_lock:
                    user = USERS[uid]

                async with matching_pool_lock:
                    if user.uid in MATCHING_POOL:
                        MATCHING_POOL.remove(user.uid)

            elif action == Action.JoinRoom.value:
                uid = data["uid"]
                async with users_lock:
                    user = USERS[uid]
                async with user_to_room_lock:
                    if user not in USER_TO_ROOM:
                        continue
                    room = USER_TO_ROOM[user]
                async with room.lock:
                    room.joined_users.add(user)

                db.collection("statuses").document(user.uid).update({"status": "busy"})
                user.db_ref.update({"status": "busy"})

                await user.websocket.send_json(
                    {
                        "action": Action.SendPrompts.value,
                        "prompts": room.prompts,
                    }
                )

            elif action == Action.LeaveRoom.value:
                uid = data["uid"]
                async with users_lock:
                    user = USERS[uid]
                async with user_to_room_lock:
                    room = USER_TO_ROOM.pop(user)
                async with room.lock:
                    room.joined_users.remove(user)

                db.collection("statuses").document(user.uid).update(
                    {"status": "online"}
                )
                user.db_ref.update({"status": "online"})

            elif action == Action.RequestNextPrompt.value:
                uid = data["uid"]
                async with users_lock:
                    user = USERS[uid]
                async with user_to_room_lock:
                    room = USER_TO_ROOM[user]
                await room.request_next_prompt(user)

            elif action == Action.DecideFriend.value:
                # TODO: make more secure (use idToken)
                uid = data["uid"]
                print(data)
                other_uid = data["otherUid"]
                accept_friend = data["acceptFriend"]

                async with users_lock:
                    user = USERS[uid]
                    other_user = USERS[other_uid]

                if accept_friend:
                    await user.request_friend(other_user)
                else:
                    await user.reject_friend(other_user)

            elif action == Action.SignOut.value:
                return

            else:
                logging.error("unsupported event: {}".format(data))
    finally:
        logging.info("ws {} closed".format(hash(websocket)))
        await clean_up_user(websocket)


print(routes)
app = web.Application()
app.add_routes(routes)

cors = aiohttp_cors.setup(
    app,
    defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
        )
    },
)

# Configure CORS on all routes.
for route in list(app.router.routes()):
    cors.add(route)

web.run_app(app)
