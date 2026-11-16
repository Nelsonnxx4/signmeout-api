ALTER TABLE "signatures"
ADD COLUMN "inkColor" VARCHAR(16) NOT NULL DEFAULT 'black',
ADD COLUMN "penWidthMm" DOUBLE PRECISION NOT NULL DEFAULT 2.5;

ALTER TABLE "signatures"
ADD CONSTRAINT "signatures_ink_color_check"
CHECK ("inkColor" IN ('red', 'green', 'black', 'blue', 'purple')),
ADD CONSTRAINT "signatures_pen_width_mm_check"
CHECK ("penWidthMm" IN (1.5, 2.5, 3.5));
