/**
 * Onde o app aponta e o que ele apresenta para entrar — decidido no build, não
 * pelo participante.
 *
 * Antes isto era uma tela: endereço do servidor e segredo do grupo, digitados
 * na primeira execução e guardados em connection.json. Para seis amigos que
 * usam o mesmo servidor, isso era uma pergunta cuja resposta já se sabia — e
 * uma barreira na primeira execução, onde ela custa mais. O instalador agora
 * sai apontado para o servidor do grupo, e a primeira tela é só nome e sala.
 *
 * A troca é explícita: o segredo viaja dentro do instalador, então quem tem o
 * instalador entra. Ele continua sendo o que separa o grupo do resto da
 * internet — o servidor segue recusando quem não o apresenta —, mas deixou de
 * ser um segredo por pessoa. É o modelo que o projeto assume.
 *
 * O segredo nunca sai do processo main: o renderer não tem canal para lê-lo,
 * exatamente como antes.
 */

/** Injetados por electron.vite.config.ts a partir do ambiente de build. */
declare const __NIGORD_TOKEN_SERVER__: string;
declare const __NIGORD_GROUP_SECRET__: string;

/**
 * O ambiente ainda vence quando presente, que é o que mantém o desenvolvimento
 * funcionando sem reconstruir o app a cada mudança de servidor.
 */
export const tokenServerUrl = (): string =>
  process.env['NIGORD_TOKEN_SERVER'] || __NIGORD_TOKEN_SERVER__;

export const groupSecret = (): string =>
  process.env['NIGORD_GROUP_SECRET'] || __NIGORD_GROUP_SECRET__;
