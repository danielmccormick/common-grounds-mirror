import Head from "next/head";
import Image from "next/image";
import Form from "react-bootstrap/Form";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { ReadyState } from "react-use-websocket";
import { useAppContext } from "../context/app";
import Button from "react-bootstrap/Button";

import { useAuthContext } from "../context/auth";
import useSocket, { Actions, BackendHost } from "../lib/socket";
import styles from "../styles/Match.module.css";

import * as friendship from "./friends";

if (process.browser) {
  friendship.setFriends(["bob", "joe", "jim"]);
  console.log(friendship.getFriends());
}

const MatchingState = Object.freeze({
  Answering: "ANSWERING",
  Matching: "MATCHING",
  MatchFound: "MATCH_FOUND",
});

function QuestionForm({
  className,
  matchingState,
  formError,
  questions,
  handleAnswerInput,
  submitAnswers,
}) {
  if (matchingState === MatchingState.Matching) {
    return <div>Finding you a match...</div>;
  } else if (matchingState === MatchingState.MatchFound) {
    return <div>Match found!</div>;
  }

  return (
    <>
      <p className={styles.p}>
        <strong>
          Answer the questions below to get the conversation started:
        </strong>
      </p>
      <div className={className}>
        {!!formError ? <p>{formError}</p> : null}
        {!!questions ? (
          <Form>
            {questions.map((item, idx) => (
              <Form.Group key={idx}>
                <Form.Label>{item.text}</Form.Label>
                <Form.Control
                  value={item.answer}
                  onChange={(e) => handleAnswerInput(e, idx)}
                />
              </Form.Group>
            ))}
            <button
              onClick={(e) => submitAnswers(e)}
              className={styles.submitButton}
            >
              Submit Answers
            </button>

          </Form>
        ) : (
          <p className={styles.divStyle}>Loading questions...</p>
        )}
      </div>
    </>
  );
}

export default function Match() {
  const router = useRouter();

  const authState = useAuthContext();
  const appState = useAppContext();
  const { sendJsonMessage, lastJsonMessage, readyState } = useSocket();

  const [questions, setQuestions] = useState(null);
  const [formError, setFormError] = useState(null);
  const [matchingState, setMatchingState] = useState(MatchingState.Answering);

  useEffect(() => {
    if (!authState.isSignedIn || readyState !== ReadyState.OPEN) {
      return;
    }

    fetch(`${BackendHost}/questions`)
      .then((response) => response.json())
      .then((data) => {
        setQuestions(
          data.questions.map((item) => {
            return { ...item, answer: "" };
          })
        );
      });

    return () => {
      if (matchingState === MatchingState.Matching) {
        sendJsonMessage({ action: Actions.CancelMatching, uid: authState.uid });
      }
    };
  }, [authState.isSignedIn, readyState]);

  useEffect(() => {
    if (lastJsonMessage === null) {
      return;
    }

    if (!!lastJsonMessage && lastJsonMessage.action === Actions.SendMatch) {
      appState.setAppState({
        ...appState,
        twilioRoomName: lastJsonMessage.roomName,
        twilioAccessToken: lastJsonMessage.twilioToken,
        otherUser: lastJsonMessage.otherUser,
      });
      router.push(`/room?name=${lastJsonMessage.roomName}`);
    }
  }, [lastJsonMessage]);

  const handleAnswerInput = (e, idxChanged) => {
    setFormError(null);
    setQuestions(
      questions.map((obj, idx) => {
        if (idx !== idxChanged) {
          return obj;
        }
        return {
          ...obj,
          answer: e.target.value,
        };
      })
    );
  };

  const submitAnswers = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!questions.every((obj) => obj.answer !== "")) {
      setFormError("Please answer every question!");
      return;
    }

    console.log(authState.uid);

    sendJsonMessage({
      action: Actions.SubmitAnswers,
      uid: authState.uid,
      questions,
    });

    setMatchingState(MatchingState.Matching);
  };


  if (!authState.isSignedIn) {
    return <div className={styles.divStyle}>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Common Grounds</title>
        <link rel="icon" href="/favicon.png" />
      </Head>

      <main>
        <h1 className={styles.h1}>
          Find some <span className={styles.underline}>common ground</span>.
        </h1>
        <p>
          <strong>
            Welcome, {authState.currentUser.displayName.split(" ")[0]}!
          </strong>
        </p>
        <p className={styles.description}>
          Common Grounds sets up coffee chats between people with all sorts of
          beliefs and backgrounds. In addition to the questions below, we use
          state-of-the-art AI to generate discussion topics for you and your
          coffee buddy.
        </p>
        <br></br>
        <QuestionForm
          className={styles.questionForm}
          matchingState={matchingState}
          formError={formError}
          questions={questions}
          handleAnswerInput={handleAnswerInput}
          submitAnswers={submitAnswers}
        />
      </main>
    </div>
  );
}
