import { LoginForm } from "@features/auth";

export default function LoginPage({
  variant = "admin",
}: {
  variant?: "admin" | "student";
}) {
  return <LoginForm variant={variant} />;
}
