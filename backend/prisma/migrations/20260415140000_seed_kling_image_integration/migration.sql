INSERT INTO "global_integration_setting" ("name", "config", "updated_at")
VALUES ('klingImage', '{}', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
