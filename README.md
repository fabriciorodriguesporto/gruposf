# Acólitos São Francisco de Assis

Aplicação responsiva para divulgar as missas e suas escalas, com painel administrativo para cadastro de acólitos, geração das equipes e publicação de avisos.

## Executar localmente

1. Instale o Node.js 20.19+ ou 22.12+.
2. Execute `npm install` e depois `npm run dev`.
3. Sem variáveis do Supabase, o site abre em modo de demonstração. Os dados ficam no navegador. Acesso de demonstração: usuário `admin`, senha `acolitos2026`.

## Configurar Supabase

1. Crie um projeto Supabase e execute [`supabase/schema.sql`](./supabase/schema.sql) no SQL Editor.
   Se o banco já foi configurado anteriormente, execute [`supabase/manual-assignment-migration.sql`](./supabase/manual-assignment-migration.sql) para habilitar nomes livres e funções repetidas nas escalas.
2. Em **Authentication → Users**, crie o usuário do administrador com e-mail e senha.
3. Copie o UUID desse usuário e cadastre a permissão executando no SQL Editor:

   ```sql
   insert into public.admin_users (user_id)
   values ('UUID-DO-USUARIO-ADMIN');
   ```

4. Copie `.env.example` para `.env.local` e informe a URL do projeto e a chave pública `anon` (ou publishable key). Nunca coloque a `service_role` key no frontend.
5. Reinicie `npm run dev`. O login administrativo usa o e-mail e a senha cadastrados no Supabase Auth.

As fotos são recortadas no navegador para 320 × 320 pixels e enviadas ao bucket público `profile-photos`, limitado a JPEG de até 1 MB. O SQL configura as permissões para leitura pública e gravação somente pelo administrador cadastrado. As escalas e os avisos ficam nas tabelas do Supabase com leitura pública e edição restrita ao administrador.

## Regras da escala

- 2º sábado do mês, às 18h: Microfone, Naveta e Turíbulo.
- 4º sábado do mês, às 17h: Microfone e Missal.
- O gerador do próximo ano procura alternar equipes, pares, participação consecutiva e funções. Quando não há pessoas suficientes cadastradas, as vagas restantes ficam como “A definir”.
- As datas e os horários podem ser ajustados individualmente; observações aparecem com destaque na página pública.

## Publicar na Vercel

Importe o repositório na Vercel, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente do projeto e publique. A configuração [`vercel.json`](./vercel.json) direciona as rotas da aplicação para o ponto de entrada.

Para validar a versão de produção localmente: `npm run build`.
