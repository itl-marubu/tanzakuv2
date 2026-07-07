-- Drop unused auth tables (FK 子→親の順)
DROP TABLE "RefreshToken";
DROP TABLE "GoogleOauth";
DROP TABLE "GitHubOauth";
DROP TABLE "AdminUser";
