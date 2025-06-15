"use client";

import { login, signup } from "./actions";
import styles from "./login.module.css"; // Create this file below

export default function LoginPage() {
  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginBox}>
        <h2 className={styles.loginTitle}>Sign In</h2>
        <form>
          <label htmlFor="email" className={styles.label}>
            Email:
          </label>
          <input id="email" name="email" type="email" required className={styles.input} />
          <label htmlFor="password" className={styles.label}>
            Password:
          </label>
          <input id="password" name="password" type="password" required className={styles.input} />
          <button formAction={login} className={styles.button}>
            Log In
          </button>
          <button formAction={signup} className={styles.button}>
            Sign Up
          </button>
        </form>
        <p className={styles.signupPrompt}>
          Don't have an account? <a href="/auth/signin" className={styles.signupLink}>Sign up</a>
        </p>
      </div>
    </div>
  );
}