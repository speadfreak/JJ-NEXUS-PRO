import { Router, type IRouter } from "express";
import healthRouter from "./health";
import anthropicRouter from "./anthropic/index";
import analysisRouter from "./analysis/index";
import journalRouter from "./journal/index";
import proxyRouter from "./proxy/index";
import webrtcRouter from "./webrtc/index";
import streamRouter from "./stream/index";
import backtestRouter from "./backtest/index";
import alchemistRouter from "./alchemist/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/anthropic", anthropicRouter);
router.use("/analysis", analysisRouter);
router.use("/journal", journalRouter);
router.use("/proxy", proxyRouter);
router.use("/webrtc", webrtcRouter);
router.use("/stream", streamRouter);
router.use("/backtest", backtestRouter);
router.use("/alchemist", alchemistRouter);

export default router;
