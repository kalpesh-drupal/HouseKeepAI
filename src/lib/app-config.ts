/** HouseKeepAI is permanently pinned to port 3006 (this project only). */
export const APP_PORT = 3006;

export const APP_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") || `http://localhost:${APP_PORT}`;

export function assertAppPort(port: number | string) {
  const n = Number(port);
  if (n !== APP_PORT) {
    throw new Error(`HouseKeepAI must run on port ${APP_PORT}, got ${port}`);
  }
}
