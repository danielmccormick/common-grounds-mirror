import React, { useState, useEffect, useRef } from "react";

import styles from "./Participant.module.css";

const Participant = ({
  username,
  muted,
  participant,
  setVideoRef,
  setCanvasRef,
  isUser = false,
  width = 640,
  height = 480,
}) => {
  const [videoTracks, setVideoTracks] = useState([]);
  const [audioTracks, setAudioTracks] = useState([]);

  const canvasRef = useRef();
  const videoRef = useRef();
  const audioRef = useRef();

  const trackpubsToTracks = (trackMap) =>
    Array.from(trackMap.values())
      .map((publication) => publication.track)
      .filter((track) => track !== null);

  useEffect(() => {
    setVideoTracks(trackpubsToTracks(participant.videoTracks));
    setAudioTracks(trackpubsToTracks(participant.audioTracks));

    const trackSubscribed = (track) => {
      if (track.kind === "video") {
        setVideoTracks((videoTracks) => [...videoTracks, track]);
      } else {
        setAudioTracks((audioTracks) => [...audioTracks, track]);
      }
    };

    const trackUnsubscribed = (track) => {
      if (track.kind === "video") {
        setVideoTracks((videoTracks) => videoTracks.filter((v) => v !== track));
      } else {
        setAudioTracks((audioTracks) => audioTracks.filter((a) => a !== track));
      }
    };

    participant.on("trackSubscribed", trackSubscribed);
    participant.on("trackUnsubscribed", trackUnsubscribed);

    return () => {
      setVideoTracks([]);
      setAudioTracks([]);
      participant.removeAllListeners();
    };
  }, [participant]);

  useEffect(() => {
    const videoTrack = videoTracks[0];
    if (videoTrack) {
      videoTrack.attach(videoRef.current);

      if (isUser && setVideoRef && setCanvasRef) {
        setVideoRef(videoRef);
        setCanvasRef(canvasRef);
      }

      return () => {
        videoTrack.detach();
      };
    }
  }, [isUser, setCanvasRef, setVideoRef, videoTracks]);

  useEffect(() => {
    const audioTrack = audioTracks[0];
    if (audioTrack) {
      audioTrack.attach(audioRef.current);
      return () => {
        audioTrack.detach();
      };
    }
  }, [audioTracks]);

  return (
    <div>
      <video
        className={isUser ? `${styles.flipped} ${styles.video}` : styles.video}
        ref={videoRef}
        width={width}
        height={height}
        autoPlay={true}
      />
      <audio ref={audioRef} autoPlay={true} muted={muted} />
    </div>
  );
};

export default Participant;
