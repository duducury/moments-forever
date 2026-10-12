import Link from "next/link";
import type { Metadata } from "next";

import { AppCreditFooter } from "@/components/app-credit-footer";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { ThemeSelector } from "@/components/theme-selector";

import styles from "../politica-de-privacidade/privacy-policy.module.css";

export const metadata: Metadata = {
  title: "Excluir conta",
  description:
    "Como excluir sua conta do Moments Forever pelo aplicativo, o que é apagado, o que pode permanecer e como pedir a exclusão se você não consegue entrar.",
};

const SUPPORT_EMAIL = "duducury1998@gmail.com";

/**
 * Public page for the "Delete account URL" field of the Google Play Console (and for anyone who
 * wants to know how deletion works). No auth and no Supabase dependency, so it always renders.
 * It describes what the code really does: the in-app flow lives in /geral (DeleteAccountSection),
 * which calls DELETE /api/me -> delete_own_account() and then removes the R2 objects. That last
 * step is best-effort (a failure does not undo the deletion), so this page never promises that
 * every file is removed, and no retention periods are stated because none are defined in the code.
 */
export default function DeleteAccountPage() {
  return (
    <main className="page-shell">
      <SignalPwaBootReady />
      <nav aria-label="Navegação" className="topbar">
        <Link className="wordmark" href="/">
          Moments Forever
        </Link>
        <div className="auth-actions">
          <ThemeSelector />
          <Link className="text-link" href="/">
            Voltar
          </Link>
        </div>
      </nav>

      <article className={styles.article}>
        <p className={styles.eyebrow}>Conta e dados</p>
        <h1 className={styles.title}>Excluir minha conta</h1>
        <p className={styles.updated}>Moments Forever — app para iPhone e Android</p>

        <section className={styles.section}>
          <p>
            Você pode excluir sua conta do Moments Forever e o conteúdo dela a
            qualquer momento, direto no aplicativo. A exclusão é{" "}
            <strong>permanente e não pode ser desfeita</strong>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Como excluir pelo aplicativo</h2>
          <ol>
            <li>Abra o Moments Forever e entre na sua conta.</li>
            <li>
              Toque em <strong>Mais</strong>, no menu inferior.
            </li>
            <li>
              Abra <strong>Geral</strong> e vá até a seção{" "}
              <strong>Zona de perigo</strong>.
            </li>
            <li>
              Toque em <strong>Excluir minha conta</strong>.
            </li>
            <li>
              Digite <strong>EXCLUIR</strong> para confirmar e toque em{" "}
              <strong>Excluir permanentemente</strong>.
            </li>
          </ol>
          <p>
            Ao terminar, você é desconectado e a conta deixa de existir. Os
            mesmos passos valem no site, depois de entrar na sua conta.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Não consigo acessar o aplicativo</h2>
          <p>
            Se você não consegue entrar (esqueceu o acesso, trocou de aparelho
            ou desinstalou o app), peça a exclusão por e-mail:
          </p>
          <div className={styles.contactCard}>
            <p>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Excluir%20minha%20conta`}>
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p>
              Escreva do e-mail cadastrado na conta, ou informe qual e-mail
              ela usa (Apple, Google ou Facebook, se for o caso), para que a
              gente consiga identificá-la. Este canal é atendido manualmente.
            </p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>O que é excluído</h2>
          <ul>
            <li>Sua conta e o login (e-mail e credenciais de acesso).</li>
            <li>Seu perfil: nome de exibição, biografia e foto de perfil.</li>
            <li>
              Suas viagens e tudo que está nelas: fotos, álbuns, momentos,
              legendas e histórias. Links públicos desses conteúdos deixam de
              funcionar.
            </li>
            <li>As tags NFC vinculadas à sua conta e as suas licenças.</li>
            <li>Os bloqueios de usuários que você fez.</li>
            <li>
              Os arquivos das suas fotos, miniaturas e foto de perfil no
              armazenamento (Cloudflare R2). Essa remoção é feita logo depois
              que a conta é apagada, mas, se ela falhar, os arquivos podem
              permanecer no armazenamento mesmo com a conta já excluída; por
              isso não garantimos que todos os arquivos sejam removidos.
              Mesmo nesse caso, eles deixam de estar associados a qualquer
              conta.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>O que pode ser mantido</h2>
          <ul>
            <li>
              <strong>Denúncias de conteúdo que você fez.</strong> Elas são
              preservadas para fins de moderação, sem vínculo com a sua conta.
            </li>
            <li>
              <strong>Códigos de ativação.</strong> Um código que você usou é
              revogado e desvinculado da sua conta; o código em si continua
              registrado, para que não possa ser reutilizado.
            </li>
            <li>
              <strong>Backups e registros (logs)</strong> mantidos pelos
              serviços que usamos para operar o app (Supabase, Cloudflare e
              Vercel) podem conter dados por algum tempo depois da exclusão.
              Não controlamos nem definimos o prazo desses registros.
            </li>
          </ul>
          <p>
            Não definimos um prazo de retenção para os dados excluídos: o que
            é apagado some da sua conta no momento da exclusão. Mais detalhes
            em nossa{" "}
            <Link href="/politica-de-privacidade">Política de Privacidade</Link>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Antes de excluir</h2>
          <p>
            Como a exclusão é definitiva, salve antes as fotos que quiser
            manter. Depois de excluir, não é possível recuperar a conta nem o
            conteúdo.
          </p>
        </section>
      </article>

      <AppCreditFooter />
    </main>
  );
}
