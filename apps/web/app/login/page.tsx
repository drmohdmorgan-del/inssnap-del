import LoginForm from "./LoginForm";

export default function LoginPage() {
  // Demo accounts live in the in-memory dev store, which is only used when
  // DATABASE_URL is unset. Never advertise them (or the dev TOTP secret)
  // on a production login page.
  return <LoginForm showDemo={!process.env.DATABASE_URL} />;
}
