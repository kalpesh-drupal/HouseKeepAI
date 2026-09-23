import { DefaultSession } from "next-auth";
import { UserRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      hotelId: string;
      hotelName: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    hotelId: string;
    hotelName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    hotelId: string;
    hotelName: string;
  }
}
