/** Session model shared by the shell and features. */
export type Session =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string; email: string };

export const SIGNED_OUT: Session = { status: "signed-out" };
