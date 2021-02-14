import Button from "react-bootstrap/Button";
import Link from "next/link";

// import Dropdown from "react-bootstrap/Dropdown";
// import DropdownButton from 'react-bootstrap/DropdownButton'
import { useAuthContext } from "../context/auth";
import styles from "./Navbar.module.css";
// import  { Dropdown, DropdownToggle, DropdownMenu, DropdownItem } from 'react-bootstrap/Dropdown';

export default function Navbar() {
  const authState = useAuthContext();

  if (!authState.isSignedIn) {
    return null;
  }

  return (
    <div className={styles.navbar}>
      <Link href="/">
        <a>
          <img
            src="/brewingconvos2.png"
            alt="slogan"
            className={styles.slogan}
          />
        </a>
      </Link>
      <Link href="/dashboard">
        {/* <Dropdown>
      <Dropdown.Toggle> */}
        <div className={styles.user}>
          <br></br>
          <img
            src={authState.currentUser.photoURL}
            alt="User profile picture"
            width={48}
            height={48}
            className={styles.userPic}
          />

          <p className="userName">
            {authState.currentUser.displayName.split(" ")[0]}
          </p>

          {/* </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item>Sign Out</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown> */}
        </div>
      </Link>
      <Button
        href="#"
        onClick={() => authState.firebase.auth().signOut()}
        className={styles.signOutButton}
      >
        Sign-out
      </Button>
    </div>
  );
}
