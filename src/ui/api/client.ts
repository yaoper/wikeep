import { sendRuntimeMessage } from "../../shared/utils";
import type { PayloadOf, ResultOf, RuntimeCommand } from "../../shared/messages";

export function send<C extends RuntimeCommand>(
  command: C,
  payload?: PayloadOf<C>,
): Promise<ResultOf<C>> {
  return sendRuntimeMessage<ResultOf<C>, PayloadOf<C>>(command, payload);
}
