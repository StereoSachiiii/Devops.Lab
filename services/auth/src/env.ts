import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: false });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: false });
