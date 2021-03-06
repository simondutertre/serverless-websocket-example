import { APIGatewayProxyHandler } from "aws-lambda";
import * as debug from "debug";

import {
  ClientMessage,
  ServerMessage,
} from "./messages";

import { Session } from "../models";

const logger = debug("Websocket");

export const handler: APIGatewayProxyHandler = async (event) => {
  const context = event.requestContext;
  const sessionId = context.connectionId!;
  const routeKey = context.routeKey as "$connect" | "$disconnect" | "$default";

  logger("%O", event);

  try {
    if (routeKey === "$connect") {
      const queryParams = event.queryStringParameters || {};
      const userId = queryParams.userId;

      if (!userId) {
        return {
          statusCode: 401,
          body: "you must need to provide userId",
        };
      }

      // Create Session
      const session = new Session();
      session.sessionId = sessionId;
      session.userId = userId;
      await session.save();
      ////
    } else if (routeKey === "$disconnect") {
      // Delete Session
      const session = await Session.primaryKey.get(sessionId);
      if (!session) {
        throw new Error("Session not exists!");
      }
      await session.delete();
      ////
    } else {
      // All the other actions
      const payload = JSON.parse(event.body!) as ClientMessage;

      switch (payload.type) {
        // tslint:disable:align
        case "create_chat_message": {
          await broadcastMessageToClient({
            type: "chat_message_created",
            message: payload.message,
            sessionId,
          });
        } break;
        case "create_stroke": {
          await broadcastMessageToClient({
            type: "stroke_created",
            stroke: payload.stroke,
          });
        } break;
        default: {
          throw new Error(`Invalid message: ${JSON.stringify(payload)}`);
        }
        // tslint:enable:align
      }
    }
  } catch (e) {
    logger("$default Error: %j\n%o", event.body, e);
    return {
      statusCode: 500,
      body: `Malformed event body: ${event.body}`,
    };
  }

  return {
    statusCode: 200,
    body: "Success",
  };
};





/**
 *
 * Server -> Client Messaging features
 *
 */
import * as AWS from "aws-sdk";

const WebsocketAPIGatewayAddress = "https://42miiaobvk.execute-api.ap-northeast-2.amazonaws.com/prod";
const apiGateway = new AWS.ApiGatewayManagementApi({ endpoint: WebsocketAPIGatewayAddress });

async function sendMessageToClient(sessionId: string, message: ServerMessage) {
  await apiGateway.postToConnection({
    ConnectionId: sessionId,
    Data: JSON.stringify(message),
  }).promise();
}

async function broadcastMessageToClient(message: ServerMessage) {
  const sessions = (await Session.primaryKey.scan({})).records;
  await Promise.all(sessions.map((record) => sendMessageToClient(record.sessionId, message)));
}
