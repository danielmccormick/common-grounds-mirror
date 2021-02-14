import Head from 'next/head'

import SignIn from '../components/signin';
import styles from '../styles/Home.module.css'
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <Head>
        <title>Common Grounds</title>
        <link rel="icon" href="/favicon.png" />
      </Head>

      <main className={styles.main}>
        <img src="/logo.png" alt="Logo" />

        <br/>
        <SignIn redirectPath='/match'></SignIn>
      </main>

      <footer className={styles.footer}>
        <p>
          © {new Date().getFullYear()} Common Grounds
        </p>
      </footer>
    </div> 
  )
}
