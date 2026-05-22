INSERT INTO "global_integration_setting" ("name", "config", "updated_at")
VALUES ('gumroad', '{}', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
