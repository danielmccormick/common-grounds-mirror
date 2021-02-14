import '../styles/globals.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import firebase from "firebase/app";

import {AuthWrapper, useAuthContext} from '../context/auth';
import { AppWrapper } from '../context/app';
import Navbar from '../components/navbar';
import { useRouter } from 'next/router';
// import {SocketWrapper} from '../context/socket';

// Configure Firebase.
const config = {
  apiKey: "REDACTED",
  authDomain: "REDACTED",
  projectId: "REDACTED",
  storageBucket: "REDACTED",
  messagingSenderId: "REDACTED",
  appId: "REDACTED",
  measurementId: "REDACTED",
};

if (!firebase.apps.length) {
  firebase.initializeApp(config);
} else {
  firebase.app(); // if already initialized, use that one
}

function MyApp({ Component, pageProps }) {
  return <AppWrapper>
    <AuthWrapper>
      <Navbar />
      <Component {...pageProps} />
    </AuthWrapper> 
  </AppWrapper>
}

export default MyApp