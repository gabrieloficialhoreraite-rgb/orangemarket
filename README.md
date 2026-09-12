# OrangeMarket — servidor e painel

## O que este projeto faz
- Recebe pedidos do site em `POST /api/orders`.
- Guarda pedidos no servidor em `data/orders.json`.
- Disponibiliza um painel em `/admin`.
- Permite login do administrador e alteração do status do pedido.
- Usa Helmet e rate limiting.
- Não armazena dados de cartão.

## Instalação
1. Instale Node.js 18+ no servidor.
2. Copie esta pasta para seu servidor.
3. Execute:
   npm install
4. Copie `.env.example` para `.env` e troque a senha e o segredo.
5. Execute:
   npm start
6. Coloque HTTPS na frente do Node (Nginx/Apache/serviço de hospedagem).
7. O painel fica em `https://SEU-DOMINIO/admin`.

## Ligando a loja
No HTML da loja, defina:
const SELLER_ENDPOINT = "https://SEU-DOMINIO/api/orders";

O navegador então enviará os dados do checkout ao seu servidor.

## Segurança
CPF, nascimento, endereço e contato são dados pessoais. Em produção:
- use HTTPS;
- limite o acesso ao painel;
- troque a senha padrão;
- faça backups protegidos;
- não exponha `data/orders.json` publicamente;
- defina retenção e exclusão dos pedidos;
- publique uma política de privacidade adequada à LGPD;
- valide os dados também no servidor;
- para pagamentos, use checkout/tokenização de um provedor de pagamento, sem receber número de cartão no seu servidor.


## Envio de pedidos por e-mail

O servidor agora envia cada novo pedido para `SELLER_EMAIL`, que por padrão é `gabrieloficialhoreraite@gmail.com`. Para o envio funcionar, configure um provedor SMTP no `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` e opcionalmente `SMTP_FROM`).

**Importante:** nunca coloque a senha da sua conta de e-mail dentro do HTML da loja ou envie essa senha para o cliente. Prefira uma senha de aplicativo/credencial SMTP quando o provedor oferecer essa opção. O pedido continua salvo no painel mesmo se o SMTP estiver temporariamente indisponível.

O formulário não coleta dados de cartão. Use um gateway de pagamento seguro para pagamentos reais. Como CPF, nascimento e endereço são dados pessoais, mantenha HTTPS, acesso restrito ao painel, política de privacidade e retenção mínima necessária.
