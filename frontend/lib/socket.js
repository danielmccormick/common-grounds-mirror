import useWebSocket from "react-use-websocket";
import { useAuthContext } from "../context/auth";

// export const SocketHost = "ws://localhost:8080";
// export const BackendHost = "http://localhost:8080";

export const SocketHost = process.env.NEXT_PUBLIC_SOCKET_HOST;
console.log(SocketHost);
export const BackendHost = process.env.NEXT_PUBLIC_BACKEND_HOST;

export const Actions = Object.freeze({
  // Client -> Server messages,
  Authenticate: "AUTHENTICATE",
  Heartbeat: "HEARTBEAT",
  SignOut: "SIGN_OUT",
  RequestQuestions: "REQUEST_QUESTIONS",
  SubmitAnswers: "SUBMIT_ANSWERS",
  CancelMatching: "CANCEL_MATCHING",
  JoinRoom: "JOIN_ROOM",
  RequestNextPrompt: "REQUEST_NEXT_PROMPT",
  RequestExtendTime: "REQUEST_EXTEND_TIME",
  LeaveRoom: "LEAVE_ROOM",
  DecideFriend: "DECIDE_FRIEND",
  CallFriend: "CALL_FRIEND",
  AcceptCall: "ACCEPT_CALL",
  RejectCall: "REJECT_:LL",

  // Server -> Client messages,
  Initialize: "INITIALIZE",
  RejectAuthentication: "REJECT_AUTHENTICATION",
  SendQuestions: "SEND_QUESTIONS",
  SendMatch: "SEND_MATCH",
  SendPrompts: "SEND_PROMPTS",
  SendPromptIndex: "SEND_PROMPT_INDEX",
  SendFriendResult: "SEND_FRIEND_RESULT",
  SendCallRequest: "SEND_CALL_REQUEST",
  UpdateFriendStatus: "UPDATE_FRIEND_STATUS",
});

export default function useSocket() {
  const authState = useAuthContext();

  const { sendJsonMessage, lastJsonMessage, readyState } = useWebSocket(
    SocketHost,
    {
      share: true,
      shouldReconnect: (_) => true,
    }
  );

  return {
    // sendJsonMessage: (object) =>
    //   sendJsonMessage({
    //     ...object,
    //     uid: authState.uid,
    //     idToken: authState.idToken,
    //   }),
    sendJsonMessage,
    lastJsonMessage,
    readyState,
  };
}
