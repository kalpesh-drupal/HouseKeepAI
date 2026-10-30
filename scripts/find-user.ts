import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const users = await p.user.findMany({
    where: { email: { contains: "americinncolumbuswi", mode: "insensitive" } },
    select: { id: true, email: true, name: true, role: true, hotelId: true },
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
