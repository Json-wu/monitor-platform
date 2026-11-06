-- CreateTable
CREATE TABLE "ops_job_run" (
    "id" UUID NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "summary" TEXT NOT NULL DEFAULT '',
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ops_job_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ops_job_run_job_name_started_at_idx" ON "ops_job_run"("job_name", "started_at" DESC);

-- CreateIndex
CREATE INDEX "ops_job_run_status_started_at_idx" ON "ops_job_run"("status", "started_at" DESC);
