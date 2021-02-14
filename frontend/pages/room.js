import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { ReadyState } from "react-use-websocket";
import Video from "twilio-video";
import Participant from "../components/participant";

import { useAppContext } from "../context/app";
import { useAuthContext } from "../context/auth";
import useSocket, { Actions, BackendHost } from "../lib/socket";
import styles from "../styles/Room.module.css";
import Button from "react-bootstrap/Button";
import Link from "next/link";
import { useWindowDimensions } from "../lib/utils";

const RoomState = Object.freeze({
  Chatting: "CHATTING",
  Deciding: "DECIDING",
});

function Prompt({ prompts, promptIdx }) {
  if (prompts === null) {
    return null;
  }

  return <h2>{prompts[promptIdx].text}</h2>;
}

function Answer({ prompts, promptIdx, uid }) {
  if (prompts === null) {
    return null;
  }

  const prompt = prompts[promptIdx];

  if (prompt.answers.uid === null) {
    return null;
  }

  return <h4>{prompt.answers[uid]}</h4>;
}

function Chat({
  prompts,
  promptIdx,
  appState,
  muted,
  setMuted,
  remoteParticipant,
  room,
  authState,
  requestNextPrompt,
  requestedNextPrompt,
  finishChatting,
}) {
  const { height, width } = useWindowDimensions();

  const videoWidth = Math.floor(Math.min(width / 2 - 50, 640));
  const videoHeight = Math.floor((videoWidth * 3) / 4);

  return (
    <>
      <div className={styles.center}>
        <Prompt prompts={prompts} promptIdx={promptIdx} />
      </div>
      <div className={styles.columns}>
        <div className={styles.column}>
          {remoteParticipant ? (
            <>
              <h2>{appState.otherUser.username}</h2>
              <Answer
                prompts={prompts}
                promptIdx={promptIdx}
                uid={appState.otherUser.uid}
              />
              <Participant
                width={videoWidth}
                height={videoHeight}
                muted={muted}
                participant={remoteParticipant}
              />
            </>
          ) : null}
        </div>
        <div className={styles.column}>
          {room && room.localParticipant ? (
            <>
              <h2>You</h2>
              <Answer
                prompts={prompts}
                promptIdx={promptIdx}
                uid={authState.uid}
              />
              <Participant
                width={videoWidth}
                height={videoHeight}
                muted={muted}
                isUser={true}
                participant={room.localParticipant}
              />
              {muted ? (
                <Button
                  href="#"
                  className={styles.muteButton}
                  onClick={() => setMuted(false)}
                >
                  Unmute
                </Button>
              ) : (
                <Button
                  href="#"
                  className={styles.muteButton}
                  onClick={() => setMuted(true)}
                >
                  Mute
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>
      <div className={styles.center}>
        {prompts && promptIdx < prompts.length - 1 ? (
          <Button
            href="#"
            className={styles.buttons}
            onClick={requestNextPrompt}
          >
            {requestedNextPrompt
              ? `Waiting on ${appState.otherUser.username}...`
              : "Next Prompt"}
          </Button>
        ) : (
          <Button onClick={finishChatting} className={styles.buttons}>
            Finish chatting
          </Button>
        )}
      </div>
    </>
  );
}

function DecideFriend({ otherUser, authState }) {
  const { sendJsonMessage, lastJsonMessage } = useSocket();

  const [friendRequested, setFriendRequested] = useState(null);
  const [friendRequestAccepted, setFriendRequestAccepted] = useState(null);

  useEffect(() => {
    if (
      !!lastJsonMessage &&
      lastJsonMessage.action === Actions.SendFriendResult
    ) {
      setFriendRequestAccepted(lastJsonMessage.accepted);
    }
  }, [lastJsonMessage]);

  const decideFriendship = (shouldFriend) => {
    sendJsonMessage({
      action: Actions.DecideFriend,
      idToken: authState.idToken,
      uid: authState.uid,
      otherUid: otherUser.uid,
      acceptFriend: shouldFriend,
    });
    setFriendRequested(shouldFriend);
    if (!shouldFriend) {
      setFriendRequestAccepted(false);
    }
  };

  const FriendForm = () => {
    if (friendRequested === null) {
      return (
        <>
          <h2>Add {otherUser.username} as a friend?</h2>
          <div className={styles.acceptFriend}>
            <div className={styles.acceptButton}>
              <img
                src="/accept.png"
                alt="Add friend"
                href="#"
                onClick={() => decideFriendship(true)}
              ></img>
            </div>
            <div className={styles.acceptButton}>
              <img
                src="/reject.png"
                alt="Don't add friend"
                href="#"
                onClick={() => decideFriendship(false)}
              ></img>
            </div>
          </div>
        </>
      );
    }

    return null;
  };

  const FriendResult = () => {
    if (friendRequested === null) {
      return null;
    } else if (friendRequestAccepted === null) {
      if (friendRequested) {
        return <h2>Friend request sent to {otherUser.username}</h2>;
      } else {
        return null;
      }
    } else if (friendRequestAccepted) {
      return <h2>You are now friends with {otherUser.username}!</h2>;
    }

    return null;
  };

  const LeaveRoom = () => (
    <div>
      <div>
        <Link href="/dashboard">
          <Button>Go to your dashboard</Button>
        </Link>
      </div>
      <br />
      <div>
        <Link href="/match">
          <Button>Find another coffee buddy</Button>
        </Link>
      </div>
    </div>
  );

  if (otherUser.isFriend) {
    return <LeaveRoom />;
  }

  return (
    <>
      <FriendForm />
      <FriendResult />
      {friendRequestAccepted !== null ? <LeaveRoom /> : null}
    </>
  );
}

export default function Room() {
  const router = useRouter();
  const authState = useAuthContext();
  const appState = useAppContext();

  const roomName = router.query.name;
  const { sendJsonMessage, lastJsonMessage, readyState } = useSocket();

  // const [twilioAccessToken, setTwilioAccessToken] = useState(null);
  // const [participant, setParticipant] = useState(null);
  const [remoteParticipant, setRemoteParticipant] = useState(null);
  const [muted, setMuted] = useState(true);
  const [prompts, setPrompts] = useState(null);
  const [promptIdx, setPromptIdx] = useState(0);
  const [requestedNextPrompt, setRequestedNextPrompt] = useState(false);
  const [roomState, setRoomState] = useState(RoomState.Chatting);

  const [room, setRoom] = useState(null);

  // useEffect(() => {
  //   if (!!twilioAccessToken || !authState.isSignedIn) {
  //     return;
  //   }
  //   fetch(`${BackendHost}/twilio`, {
  //     method: 'POST',
  //     mode: 'cors',
  //     headers: {
  //       'Content-Type': 'application/json'
  //     },
  //     body: JSON.stringify({uid: authState.uid})
  //   }).then((response) => response.json())
  //   .then((data) => {
  //     setTwilioAccessToken(data.accessToken)
  //   })
  // }, [roomName, authState.isSignedIn]);

  useEffect(() => {
    sendJsonMessage({ action: Actions.JoinRoom, uid: authState.uid });

    return () => {
      sendJsonMessage({ action: Actions.LeaveRoom, uid: authState.uid });
    };
  }, []);

  useEffect(() => {
    if (lastJsonMessage === null) {
      return;
    }

    if (lastJsonMessage.action === Actions.SendPrompts) {
      setPrompts(lastJsonMessage.prompts);
      setPromptIdx(0);
    } else if (lastJsonMessage.action === Actions.SendPromptIndex) {
      setPromptIdx(lastJsonMessage.promptIndex);
      setRequestedNextPrompt(false);
    }
  }, [lastJsonMessage]);

  useEffect(() => {
    if (appState.twilioAccessToken === null) {
      return;
    }

    const participantConnected = (participant) => {
      console.log("participant connected");
      // setParticipants((prevParticipants) => [...prevParticipants, participant]);
      setRemoteParticipant(participant);
    };
    const participantDisconnected = (participant) => {
      console.log("participant disconnected");
      // setParticipants((prevParticipants) =>
      //   prevParticipants.filter((p) => p !== participant)
      // );
      setRemoteParticipant(null);
    };

    console.log("connecting to twilio");

    Video.connect(appState.twilioAccessToken, {
      name: roomName,
      // audio: true,
      // video: { width: 640 },
    }).then(
      (room) => {
        console.log("connected to twilio!!");
        setRoom(room);

        room.participants.forEach(participantConnected);
        room.on("participantConnected", participantConnected);
        room.on("participantDisconnected", participantDisconnected);
        room.on("disconnected", (room) => {
          // Detach the local media elements
          room.localParticipant.tracks.forEach((publication) => {
            const attachedElements = publication.track.detach();
            attachedElements.forEach((element) => element.remove());
          });
        });

        window.addEventListener("unload", () => {
          if (room && room.localParticipant.state === "connected") {
            room.localParticipant.tracks.forEach(function (trackPublication) {
              trackPublication.track.stop();
            });
            console.log("disconnecting from twilio");
            room.disconnect();
          }
        });
      },
      (error) => {
        console.log(error);
      }
    );

    return () => {
      setRoom((currentRoom) => {
        if (currentRoom && currentRoom.localParticipant.state === "connected") {
          currentRoom.localParticipant.tracks.forEach(function (
            trackPublication
          ) {
            trackPublication.track.stop();
          });
          currentRoom.disconnect();
          return null;
        } else {
          return currentRoom;
        }
      });
    };
  }, [appState.twilioAccessToken]);

  const requestNextPrompt = () => {
    setRequestedNextPrompt(true);
    sendJsonMessage({
      action: Actions.RequestNextPrompt,
      uid: authState.uid,
    });
  };

  const finishChatting = () => {
    if (room) {
      room.disconnect();
    }
    setRoomState(RoomState.Deciding);
  };

  if (!authState.isSignedIn || !roomName) {
    return <div className={styles.divStyle}>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Common Grounds</title>
        <link rel="icon" href="/favicon.png" />
      </Head>

      <main>
        <div className={styles.center}>
          <h1>Coffee Chat</h1>
        </div>
        {roomState === RoomState.Chatting ? (
          <Chat
            prompts={prompts}
            promptIdx={promptIdx}
            appState={appState}
            muted={muted}
            setMuted={setMuted}
            remoteParticipant={remoteParticipant}
            room={room}
            authState={authState}
            requestNextPrompt={requestNextPrompt}
            requestedNextPrompt={requestedNextPrompt}
            finishChatting={finishChatting}
          />
        ) : (
          <DecideFriend otherUser={appState.otherUser} authState={authState} />
        )}
      </main>
    </div>
  );
}
