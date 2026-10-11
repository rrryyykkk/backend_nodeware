/*
  Warnings:

  - A unique constraint covering the columns `[public_id]` on the table `Attachment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[public_id]` on the table `Comment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[public_id]` on the table `Project` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[public_id]` on the table `Task` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[public_id]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - The required column `public_id` was added to the `Attachment` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `public_id` was added to the `Comment` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `public_id` was added to the `Project` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `public_id` was added to the `Task` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `public_id` was added to the `User` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "public_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "public_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "public_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "public_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "public_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_public_id_key" ON "Attachment"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_public_id_key" ON "Comment"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_public_id_key" ON "Project"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "Task_public_id_key" ON "Task"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_public_id_key" ON "User"("public_id");
