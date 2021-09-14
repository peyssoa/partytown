import {
  InitWebWorkerData,
  MainAccessRequest,
  MainAccessResponse,
  MainWindowContext,
  MessageFromWorkerToSandbox,
  PartytownWebWorker,
  WorkerMessageType,
} from '../types';
import { debug } from '../utils';
import { getAndSetInstanceId } from './main-instances';
import { initializedWorkerScript, readNextScript } from './read-main-scripts';
import { readMainInterfaces } from './read-interfaces';
import WebWorkerBlob from '@web-worker-blob';

const onMessageFromWebWorker = (winCtx: MainWindowContext, msg: MessageFromWorkerToSandbox) => {
  const msgType = msg[0];
  const doc = winCtx.$window$.document;

  if (msgType === WorkerMessageType.MainDataRequestFromWorker) {
    // web worker has requested data from the main thread
    const firstScriptId = getAndSetInstanceId(winCtx, doc.querySelector('script'));
    const mainInterfaces = readMainInterfaces(winCtx.$window$, doc);
    const initWebWorkerData: InitWebWorkerData = {
      $winId$: winCtx.$winId$,
      $parentWinId$: winCtx.$parentWinId$,
      $config$: winCtx.$config$ || {},
      $documentCompatMode$: doc.compatMode,
      $documentCookie$: doc.cookie,
      $documentReadyState$: doc.readyState,
      $documentReferrer$: doc.referrer,
      $documentTitle$: doc.title,
      $firstScriptId$: firstScriptId,
      $interfaces$: mainInterfaces,
      $scopePath$: winCtx.$scopePath$,
      $url$: winCtx.$url$,
    };

    // send to the web worker the main data
    winCtx.$worker$!.postMessage([WorkerMessageType.MainDataResponseToWorker, initWebWorkerData]);
  } else if (msgType === WorkerMessageType.InitializeNextWorkerScript) {
    // web worker has been initialized with the main data
    readNextScript(winCtx);
  } else if (msgType === WorkerMessageType.InitializedWorkerScript) {
    // web worker has finished initializing the script, and has another one to do
    // doing this postMessage back-and-forth so we don't have long running tasks
    initializedWorkerScript(winCtx, doc, msg[1] as number, msg[2] as string);
  } else if (msgType === WorkerMessageType.ForwardMainDataResponse) {
    const accessRsp = msg[1] as MainAccessResponse;

    const forwardMsgResolve = forwardMsgResolves.get(accessRsp.$msgId$);
    if (forwardMsgResolve) {
      forwardMsgResolves.delete(accessRsp.$msgId$);
      forwardMsgResolve(accessRsp);
      readNextScript(winCtx);
    }
  }
};

const forwardMsgResolves = new Map<number, (accessRsp: MainAccessResponse) => void>();

export const forwardToWinAccessHandler = (
  worker: PartytownWebWorker,
  accessReq: MainAccessRequest
) =>
  new Promise<MainAccessResponse>((resolve) => {
    forwardMsgResolves.set(accessReq.$msgId$, resolve);
    worker.postMessage([WorkerMessageType.ForwardMainDataRequest, accessReq]);
  });

export const createWebWorker = (winCtx: MainWindowContext) => {
  winCtx.$worker$ = new Worker(
    debug
      ? './partytown-ww.debug.js'
      : URL.createObjectURL(
          new Blob([WebWorkerBlob], {
            type: 'text/javascript',
          })
        ),
    { name: `Partytown (${winCtx.$winId$}) 🎉` }
  );

  winCtx.$worker$.onmessage = (ev) => onMessageFromWebWorker(winCtx, ev.data);
};