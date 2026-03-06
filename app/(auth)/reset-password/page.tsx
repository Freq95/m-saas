import { Suspense } from 'react';
import { ResetPasswordForm } from './ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p>Se valideaza linkul...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
