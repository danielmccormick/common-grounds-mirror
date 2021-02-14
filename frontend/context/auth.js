import { createContext, useContext, useEffect, useState } from "react";
import firebase from "firebase/app";
import "firebase/auth";
import { useRouter } from "next/router";
import useSocket, { Actions } from "../lib/socket";
import { useAppContext } from "./app";
import { ReadyState } from "react-use-websocket";

export const AuthContext = createContext();

// Configure FirebaseUI.
const uiConfig = {
  // Popup signin flow rather than redirect flow.
  signInFlow: "redirect",
  // Redirect to /signedIn after sign in is successful. Alternatively you can provide a callbacks.signInSuccess function.
  signInSuccessUrl: "/match",
  // We will display Google and Facebook as auth providers.
  signInOptions: [
    firebase.auth.GoogleAuthProvider.PROVIDER_ID,
    firebase.auth.FacebookAuthProvider.PROVIDER_ID,
  ],
  // callbacks: {
  //   // Avoid redirects after sign-in.
  //   signInSuccessWithAuthResult: () => false,
  // },
};

// function useInterval(callback, delay) {
//   const savedCallback = useRef();

//   // Remember the latest callback.
//   useEffect(() => {
//     savedCallback.current = callback;
//   }, [callback]);

//   // Set up the interval.
//   useEffect(() => {
//     function tick() {
//       savedCallback.current();
//     }
//     if (delay !== null) {
//       let id = setInterval(tick, delay);
//       return () => clearInterval(id);
//     }
//   }, [delay]);
// }

const connectionStatus = {
  [ReadyState.CONNECTING]: "Connecting",
  [ReadyState.OPEN]: "Open",
  [ReadyState.CLOSING]: "Closing",
  [ReadyState.CLOSED]: "Closed",
  [ReadyState.UNINSTANTIATED]: "Uninstantiated",
};

export function AuthWrapper({ children }) {
  const appState = useAppContext();
  let [authState, setAuthState] = useState({
    isSignedIn: false,
    currentUser: null,
    idToken: null,
    uid: null,
    firebase: firebase,
    uiConfig: uiConfig,
  });

  const router = useRouter();

  const { sendJsonMessage, lastJsonMessage, readyState } = useSocket();

  useEffect(() => {
    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      if (user !== null) {
        user
          .getIdToken(/* forceRefresh */ true)
          .then(function (idToken) {
            setAuthState({
              ...authState,
              isSignedIn: true,
              currentUser: user,
              idToken: idToken,
              uid: user.uid,
            });
            appState.setAppState({ ...appState, uid: user.uid });

            sendJsonMessage({
              action: Actions.Authenticate,
              idToken: idToken,
              uid: user.uid,
            });
          })
          .catch(function (error) {
            console.error("oops", error);
          });
      } else {
        setAuthState({
          ...authState,
          isSignedIn: false,
          currentUser: null,
          idToken: null,
          uid: null,
        });
        appState.setAppState({ ...appState, uid: null });
        sendJsonMessage({
          action: Actions.SignOut,
        });
        router.push("/");
      }
    });
    return () => unsubscribe(); // Make sure we un-register Firebase observers when the component unmounts.
  }, []);

  useEffect(() => {
    if (!lastJsonMessage) {
      return;
    }

    if (lastJsonMessage.action == Actions.Initialize) {
      console.log("initializing!", lastJsonMessage);
    } else if (lastJsonMessage.action === Actions.RejectAuthentication) {
      sendJsonMessage({
        action: Actions.Authenticate,
        idToken: authState.idToken,
        uid: authState.uid,
      });
    } else if (!Object.values(Actions).includes(lastJsonMessage.action)) {
      console.log("Unrecognized action:", lastJsonMessage);
    } else {
      console.log("Received action:", lastJsonMessage);
    }
  }, [lastJsonMessage]);

  useEffect(() => {
    console.log(`WEBSOCKET ${connectionStatus[readyState]}`);
    if (readyState === ReadyState.OPEN && authState.isSignedIn) {
      sendJsonMessage({
        action: Actions.Authenticate,
        idToken: authState.idToken,
        uid: authState.uid,
      });
    }
  }, [readyState]);

  return (
    <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
