-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isDeletedForEveryone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isForwarded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isViewOnce" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "replyToId" TEXT,
ADD COLUMN     "screenshotDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "selfDestructTimer" INTEGER;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isGroup" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RoomParticipant" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isMuted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastReadAt" TIMESTAMP(3),
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeen" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MessageMedia" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDeletion" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDeletion_pkey" PRIMARY KEY ("messageId","userId")
);

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageMedia" ADD CONSTRAINT "MessageMedia_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeletion" ADD CONSTRAINT "MessageDeletion_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeletion" ADD CONSTRAINT "MessageDeletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
