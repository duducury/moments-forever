import Image from "next/image";
import Link from "next/link";

import { HomePrimaryCta } from "./home-cta";
import { HomeHeader } from "./home-header";
import styles from "./home.module.css";

const MEMORY_PHOTOS = [
  {
    src: "/home/santorini.jpg",
    alt: "Casas brancas e cúpulas azuis em Santorini",
    label: "Santorini",
    className: "memoryTall",
  },
  {
    src: "/home/paris.jpg",
    alt: "Torre Eiffel em Paris ao entardecer",
    label: "Paris",
    className: "memoryWide",
  },
  {
    src: "/home/tokyo.jpg",
    alt: "Cruzamento iluminado em Tóquio à noite",
    label: "Tóquio",
    className: "memorySquare",
  },
  {
    src: "/home/machu.jpg",
    alt: "Machu Picchu nas montanhas",
    label: "Machu Picchu",
    className: "memorySquareAlt",
  },
  {
    src: "/home/amalfi.jpg",
    alt: "Costa Amalfitana vista do mar",
    label: "Amalfi",
    className: "memoryFeature",
  },
] as const;

export default function Home() {
  return (
    <main className={styles.home}>
      <HomeHeader />

      <div className={styles.main}>
        <section aria-labelledby="home-hero-title" className={styles.hero}>
          <div className={styles.heroVisual}>
            <div className={styles.heroPhoto}>
              <Image
                alt="Costa Amalfitana ao entardecer"
                className={styles.heroPhotoImage}
                height={900}
                priority
                sizes="(max-width: 720px) 92vw, 46vw"
                src="/home/capri.jpg"
                width={1200}
              />
            </div>
            <div className={styles.heroMark}>
              <Image
                alt="Moments Forever"
                className={styles.heroLogo}
                height={1254}
                priority
                sizes="120px"
                src="/brand/logo.png"
                width={1254}
              />
            </div>
          </div>

          <div className={styles.heroCopy}>
            <p className={styles.brand}>Moments Forever</p>
            <h1 className={styles.title} id="home-hero-title">
              Suas histórias, sempre por perto.
            </h1>
            <p className={styles.lead}>
              Guarde suas viagens. Reviva seus momentos.
            </p>
            <HomePrimaryCta className={styles.ctaRow} />
            <p className={styles.heroAside}>Viagens · Lugares · Momentos</p>
          </div>
        </section>

        <section
          aria-labelledby="home-memories-title"
          className={styles.memories}
        >
          <div className={styles.memoriesHead}>
            <p className={styles.memoriesEyebrow}>Memórias que ficam</p>
            <h2 className={styles.memoriesTitle} id="home-memories-title">
              Lugares que merecem ser revisitados.
            </h2>
          </div>
          <div className={styles.memoryMosaic}>
            {MEMORY_PHOTOS.map((photo) => (
              <figure
                className={`${styles.memoryCell} ${styles[photo.className]}`}
                key={photo.src}
              >
                <Image
                  alt={photo.alt}
                  className={styles.memoryImage}
                  height={900}
                  sizes="(max-width: 720px) 50vw, 33vw"
                  src={photo.src}
                  width={1200}
                />
                <figcaption className={styles.memoryCaption}>
                  {photo.label}
                </figcaption>
              </figure>
            ))}
          </div>
          <div className={styles.memoryStrip} aria-hidden="true">
            <figure className={styles.memoryStripCell}>
              <Image
                alt=""
                className={styles.memoryImage}
                height={700}
                sizes="33vw"
                src="/home/dubai.jpg"
                width={1000}
              />
            </figure>
            <figure className={styles.memoryStripCell}>
              <Image
                alt=""
                className={styles.memoryImage}
                height={700}
                sizes="33vw"
                src="/home/venice.jpg"
                width={1000}
              />
            </figure>
            <figure className={styles.memoryStripCell}>
              <Image
                alt=""
                className={styles.memoryImage}
                height={700}
                sizes="33vw"
                src="/home/paris.jpg"
                width={1000}
              />
            </figure>
          </div>
        </section>

        <section
          aria-labelledby="home-concepts-title"
          className={styles.section}
        >
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="home-concepts-title">
              Uma coleção, em camadas simples.
            </h2>
            <p className={styles.sectionLead}>
              Organize memórias do jeito que elas acontecem — sem simular
              viagens ou fotos que ainda não existem.
            </p>
          </div>
          <ol className={styles.conceptList}>
            <li className={styles.conceptItem}>
              <span className={styles.conceptIndex} aria-hidden="true">
                01
              </span>
              <div className={styles.conceptCopy}>
                <h3>Viagem</h3>
                <p>Cada viagem vira uma coleção própria, fácil de encontrar.</p>
              </div>
            </li>
            <li className={styles.conceptItem}>
              <span className={styles.conceptIndex} aria-hidden="true">
                02
              </span>
              <div className={styles.conceptCopy}>
                <h3>Lugares</h3>
                <p>
                  Dentro da viagem, os lugares guardam o contexto de cada
                  momento.
                </p>
              </div>
            </li>
            <li className={styles.conceptItem}>
              <span className={styles.conceptIndex} aria-hidden="true">
                03
              </span>
              <div className={styles.conceptCopy}>
                <h3>Fotos</h3>
                <p>Reviva suas fotos em uma experiência limpa e fotográfica.</p>
              </div>
            </li>
          </ol>
        </section>

        <section aria-labelledby="home-finale-title" className={styles.finale}>
          <div className={styles.finaleBackdrop} aria-hidden="true">
            <Image
              alt=""
              className={styles.finaleBackdropImage}
              height={800}
              sizes="100vw"
              src="/home/dubai.jpg"
              width={1400}
            />
          </div>
          <div className={styles.finaleInner}>
            <h2 id="home-finale-title">Comece a guardar suas viagens.</h2>
            <p>Crie sua coleção e organize o que importa.</p>
            <HomePrimaryCta className={styles.ctaRow} />
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <p className={styles.footerBrand}>Moments Forever</p>
        <nav aria-label="Rodapé" className={styles.footerNav}>
          <Link className={styles.footerLink} href="/privacidade">
            Privacidade
          </Link>
          <Link className={styles.footerLink} href="/login">
            Entrar
          </Link>
        </nav>
      </footer>
    </main>
  );
}
