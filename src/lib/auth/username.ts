const usernamePattern = /^[a-z0-9][a-z0-9_.-]{2,31}$/;

export function usernameToInternalEmail(value: string): string | null {
  const username = value.trim().toLowerCase();
  return usernamePattern.test(username)
    ? `${Buffer.from(username, "utf8").toString("hex")}@belleza.invalid`
    : null;
}
