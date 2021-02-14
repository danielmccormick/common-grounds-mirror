import Head from "next/head";
import { createContext, useContext, useEffect, useState } from "react";
import firebase from "firebase/app";
import "firebase/firestore";
import { delBasePath } from "next/dist/next-server/lib/router/router";

export const AppContext = createContext();

export function AppWrapper({ children }) {
  let [appState, setAppState] = useState({
    uid: null,
    twilioRoomName: null,
    twilioAccessToken: null,
    otherUser: null,
    firestore: firebase.firestore(),
    friends: [],
  });

  useEffect(() => {
    if (appState.uid === null) {
      return;
    }

    appState.firestore
      .collection("friends")
      .where("to", "==", appState.uid)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const friendRef = appState.firestore
              .collection("users")
              .doc(change.doc.data().from);

            friendRef.get().then((friend) => {
              const friendData = friend.data();

              setAppState((freshAppState) => ({
                ...freshAppState,
                friends: [
                  ...freshAppState.friends,
                  {
                    uid: friend.id,
                    displayName: friendData.display_name,
                    status: friendData.status,
                    photoUrl: friendData.photo_url,
                    lastOnline: friendData.last_online,
                    dbRef: friendRef,
                  },
                ],
              }));
            });

            // TODO: unsubscribe eventually...
            friendRef.onSnapshot((doc) => {
              const friendData = doc.data();
              console.log(
                `${friendData.display_name}'s new status: ${friendData.status}`
              );
      
              setAppState((freshAppState) => ({
                ...freshAppState,
                friends: freshAppState.friends.map((item) => {
                  if (item.uid != doc.id) {
                    return item;
                  }
                  return {
                    ...item,
                    status: friendData.status,
                    subscribed: true,
                  };
                }),
              }));
            });
          }
          if (change.type === "removed") {
            setAppState((freshAppState) => ({
              ...freshAppState,
              friends: freshAppState.friends.filter((item) => item.uid !== change.doc.data().from),
            }));
          }
        });
      });
  }, [appState.uid]);

  return (
    <AppContext.Provider value={{ ...appState, setAppState }}>
      <Head>
        <title>Common Grounds</title>
        <link rel="icon" href="/favicon.png" />
      </Head>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
