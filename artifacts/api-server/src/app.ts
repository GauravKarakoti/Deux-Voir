import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import pinoHttp from "pino-http";
import router from "./routes";
import metadataRouter from "./routes/metadata";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "128kb" }));

app.use("/api", router);
app.use("/", metadataRouter);

const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const errorLike = error as {
    code?: string;
    status?: number;
    statusCode?: number;
    type?: string;
    message?: string;
  };
  const status =
    error instanceof multer.MulterError
      ? error.code === "LIMIT_FILE_SIZE"
        ? 413
        : 400
      : errorLike.statusCode ??
        (errorLike.type === "entity.too.large" ? 413 : errorLike.status) ??
        500;
  req.log.error({ err: error, statusCode: status }, "Request failed");
  const message =
    status === 413
      ? "The uploaded content exceeds the size limit."
      : status < 500 && errorLike.message
        ? errorLike.message
        : "The request could not be completed.";
  res.status(status).json({ error: message });
};

app.use(errorHandler);

export default app;
