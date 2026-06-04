import { LoginForm } from '@features/auth';

export default function LoginPage({
  variant = 'admin',
}: {
  variant?: 'admin' | 'teacher' | 'student';
}) {
  return <LoginForm variant={variant} />;
}
