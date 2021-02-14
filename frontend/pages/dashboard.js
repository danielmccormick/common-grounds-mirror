import React from "react";
import ReactDOM from "react-dom";
import { useEffect, useState } from "react";
import { MDBTable, MDBTableBody, MDBTableHead } from "mdbreact";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";

import { BackendHost } from "../lib/socket";
import { useAuthContext } from "../context/auth";
import { useAppContext } from "../context/app";
import styles from "../styles/Dashboard.module.css";

export default function Dashboard() {
  const authState = useAuthContext();
  const appState = useAppContext();
  const [show, setShow] = useState(false);
  const [modalFriend, setModalFriend] = useState(null);

  const handleClose = () => setShow(false);
  const handleShow = (friend) => {
    setModalFriend(friend);
    setShow(true);
  };

  const removeFriend = (friend) => {
    fetch(`${BackendHost}/remove_friend`, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idToken: authState.idToken,
        otherUserUid: friend.uid,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        handleClose();
      });
  };

  if (!authState.isSignedIn) {
    return null;
  }

  console.log(authState.uid);

  return (
    <div className={styles.container}>
      <h1 className={styles.h1}>Dashboard</h1>
      <br></br>
      <div>
        <div>
          <p className={styles.userName}>
            <strong>
              {" "}
              Welcome, {authState.currentUser.displayName.split(" ")[0]}!{" "}
            </strong>
            <br></br>
            This is where you can find information about your friends and your
            time on Common Grounds.
            <br></br>
            Click on the Common Grounds logo in the top left corner to start matching with others!
          </p>
        </div>
        <div className={styles.allStats}>
          <img src="/dashboard_data.png" className={styles.stats}></img>
          <img src="/dashboard_data2.png" className={styles.stats2}></img>
        </div>
      </div>
      <div>
        <h1 className={styles.h1}>Friends</h1>
        <p className={styles.userName}>Click on a friend for more options!</p>

        <div className={styles.friendsList}>
          {appState.friends.map((item, idx) => (
            <a key={idx} onClick={() => handleShow(item)} className={styles.friendLink}>
              <div className={styles.friend}>
                <img src={item.photoUrl} className={styles.friendPhoto}></img>
                <p className={styles.friendNameStatus}> {item.displayName} </p>
                <p className={styles.friendNameStatus}>{item.status}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
      {modalFriend === null ? null : (
        <Modal show={show} onHide={handleClose}>
          <Modal.Header closeButton>
            <Modal.Title>{modalFriend.displayName}</Modal.Title>
          </Modal.Header>
          <Modal.Footer>
            <Button variant="primary" onClick={handleClose}>
              Call {modalFriend.displayName} now
            </Button>
            <Button variant="danger" onClick={() => removeFriend(modalFriend)}>
              Remove Friend
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}
