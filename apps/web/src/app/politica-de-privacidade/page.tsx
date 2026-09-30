import Link from "next/link";
import type { Metadata } from "next";

import { AppCreditFooter } from "@/components/app-credit-footer";
import { SignalPwaBootReady } from "@/components/signal-pwa-boot-ready";
import { ThemeSelector } from "@/components/theme-selector";

import styles from "./privacy-policy.module.css";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description:
    "Como o Moments Forever coleta, usa e protege seus dados, e como solicitar a exclusão da sua conta.",
};

const SUPPORT_EMAIL = "duducury1998@gmail.com";

/**
 * Public legal page — no auth required, no Supabase dependency, so it
 * always renders even if the backend is misconfigured (this is the page
 * Apple's reviewers open directly from the App Store Connect "Privacy
 * Policy URL" field). Content describes only what this app actually does;
 * see the services and data model it's grounded in: Supabase (auth + Postgres),
 * Cloudflare R2 (photo storage), Vercel (hosting), OpenStreetMap/Nominatim
 * (reverse geocoding of GPS coordinates only).
 */
export default function PrivacyPolicyPage() {
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
        <p className={styles.eyebrow}>Legal</p>
        <h1 className={styles.title}>Política de Privacidade</h1>
        <p className={styles.updated}>Última atualização: 30 de setembro de 2026</p>

        <section className={styles.section}>
          <p>
            O Moments Forever é um app para guardar e organizar fotos de
            viagens. Esta página explica quais dados coletamos, como
            usamos, com quem compartilhamos e como você pode solicitar a
            exclusão da sua conta. Ela cobre tanto o site
            (momentsforever.vercel.app) quanto o app para iPhone.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Quais dados coletamos</h2>
          <p>
            <strong>Conta.</strong> Para criar uma conta usamos e-mail e
            senha, ou login com Google/Facebook. A autenticação é feita
            pelo Supabase, que armazena seu e-mail e a credencial de login;
            nós não vemos nem guardamos sua senha.
          </p>
          <p>
            <strong>Perfil.</strong> Nome de exibição, biografia e foto de
            perfil, se você optar por preenchê-los.
          </p>
          <p>
            <strong>Conteúdo que você envia.</strong> As fotos que você
            importa, junto com viagens, álbuns, legendas e histórias que
            você escrever.
          </p>
          <p>
            <strong>Localização das fotos.</strong> Quando uma foto tem
            coordenadas de GPS no EXIF, usamos essas coordenadas para
            sugerir automaticamente o nome do lugar (ex.: &ldquo;Paris,
            França&rdquo;) e posicionar a foto no mapa da viagem. Você pode remover a
            localização de qualquer foto a qualquer momento, em qualquer
            viagem.
          </p>
          <p>
            <strong>Tags NFC.</strong> Se você vincular uma tag NFC física a
            uma viagem, a tag guarda apenas um código aleatório sem
            nenhuma informação pessoal — esse código só serve para abrir o
            link público daquele álbum.
          </p>
          <p>
            <strong>Código de ativação e plano.</strong> Se você ativar um
            plano por código, guardamos qual código foi usado e a qual
            conta ele está associado, para aplicar os limites do plano
            (por exemplo, quantidade de tags NFC).
          </p>
        </section>

        <section className={styles.section}>
          <h2>Como usamos os dados</h2>
          <ul>
            <li>Fazer o app funcionar: login, salvar e exibir suas viagens e fotos.</li>
            <li>
              Organizar automaticamente fotos por lugar e data, usando as
              coordenadas de GPS já presentes nas fotos.
            </li>
            <li>Aplicar os limites do seu plano (número de tags NFC, por exemplo).</li>
            <li>
              Mostrar seu perfil publicamente, apenas se e quando você
              decidir tornar seu perfil público.
            </li>
          </ul>
          <p>
            Não usamos seus dados para propaganda, não fazemos rastreamento
            de comportamento e não usamos nenhuma ferramenta de análise ou
            estatística de terceiros dentro do app.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Perfis públicos</h2>
          <p>
            Por padrão, sua conta é privada. Se você optar por tornar seu
            perfil público, as viagens, álbuns e fotos marcados como
            públicos — junto com nome de exibição, biografia e foto de
            perfil — ficam visíveis para qualquer pessoa com o link, sem
            precisar de login. Você pode reverter isso a qualquer momento.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Com quem compartilhamos dados</h2>
          <p>Usamos os seguintes serviços para operar o app:</p>
          <ul>
            <li>
              <strong>Supabase</strong> — banco de dados e autenticação da
              conta.
            </li>
            <li>
              <strong>Cloudflare R2</strong> — armazenamento das fotos que
              você envia, em um bucket privado; o acesso é feito por links
              temporários, nunca públicos por padrão.
            </li>
            <li>
              <strong>Vercel</strong> — hospedagem do site e do backend do
              app.
            </li>
            <li>
              <strong>OpenStreetMap / Nominatim</strong> — usado apenas
              para transformar as coordenadas de GPS de uma foto em um
              nome de lugar legível. Recebe somente latitude e longitude —
              nunca a foto em si ou qualquer outro dado pessoal.
            </li>
          </ul>
          <p>
            Não vendemos seus dados a terceiros e não compartilhamos suas
            fotos ou informações pessoais com anunciantes.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Cookies e armazenamento no dispositivo</h2>
          <p>
            Usamos um cookie de sessão para manter você conectado
            (gerenciado pelo Supabase). O navegador também guarda
            localmente sua preferência de tema (claro/escuro) e uma cópia
            das fotos que você já visualizou, para o app abrir mais rápido
            e funcionar offline — essa cópia local fica só no seu
            aparelho.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Segurança</h2>
          <p>
            Suas fotos ficam em um bucket privado, nunca públicas por
            padrão; o acesso é sempre feito por links temporários gerados
            na hora. O banco de dados usa regras de acesso por linha, de
            forma que cada conta só enxerga os próprios dados — a menos
            que você mesmo torne algo público.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Retenção e exclusão de dados</h2>
          <p>
            Guardamos seus dados enquanto sua conta existir. Hoje a
            exclusão de conta é feita mediante solicitação por e-mail — não
            existe ainda um botão de autoatendimento dentro do app. Ao
            solicitar a exclusão, removemos sua conta, suas fotos (inclusive
            do armazenamento), viagens, álbuns e tags NFC vinculadas.
          </p>
          <p>
            Para solicitar a exclusão dos seus dados, entre em contato pelo
            e-mail abaixo informando o e-mail usado na sua conta.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Crianças</h2>
          <p>
            O Moments Forever não é direcionado a menores de 13 anos e não
            coletamos intencionalmente dados de crianças nessa faixa
            etária.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Alterações a esta política</h2>
          <p>
            Podemos atualizar esta política conforme o app evolui. A data
            no topo desta página sempre indica a versão mais recente.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Contato</h2>
          <div className={styles.contactCard}>
            <p>Dúvidas sobre privacidade ou pedidos de exclusão de dados:</p>
            <p>
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
        </section>
      </article>

      <AppCreditFooter />
    </main>
  );
}
