/*
  Warnings:

  - Made the column `codigo` on table `lotes_materia_prima` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "lotes_materia_prima" ALTER COLUMN "codigo" SET NOT NULL;
