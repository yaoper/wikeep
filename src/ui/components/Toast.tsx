import { ToastIcon } from "./icons";

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;

  return (
    <div className="toast-wrap">
      <div className="toast">
        <ToastIcon />
        {message}
      </div>
    </div>
  );
}
