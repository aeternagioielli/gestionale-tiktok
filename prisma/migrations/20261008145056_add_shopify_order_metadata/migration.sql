-- AlterTable
ALTER TABLE "InventoryItem" ALTER COLUMN "reservedQty" DROP NOT NULL,
ALTER COLUMN "reservedQty" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "orderNumber" TEXT;
