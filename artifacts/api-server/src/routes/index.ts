import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import researchRouter from "./research";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(researchRouter);

export default router;
