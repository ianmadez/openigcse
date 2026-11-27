import { startTransition, useEffect, useRef, type FormEvent } from "react";

/**
 * Submits a form to a `useActionState` action without React 19's automatic form reset.
 *
 * `<form action={...}>` clears every uncontrolled field once the action finishes, even when the
 * server refused, so a mistyped password also wiped the email. Use as `onSubmit={keepInput(action)}`:
 * the browser still validates first, the pressed button's name and value are kept, and the
 * `pending` flag from `useActionState` drives the button.
 */
export function keepInput(action: (data: FormData) => void, guard?: (event: FormEvent<HTMLFormElement>) => boolean) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (guard && !guard(event)) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => action(data));
  };
}

/**
 * For forms that should empty after a success (a new PIN, an added override). `state` is the
 * action's result, so each new result is seen even when two successes look alike.
 */
export function useResetOnSuccess(state: unknown, succeeded: boolean) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (succeeded) form.current?.reset();
  }, [state, succeeded]);
  return form;
}
