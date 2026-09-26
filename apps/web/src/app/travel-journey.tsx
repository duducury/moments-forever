"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import { HomePrimaryCta } from "./home-cta";
import styles from "./travel-journey.module.css";

const stops = [
  { title: "Uma viagem pelas suas lembranças", body: "", image: "/home/santorini.jpg", alt: "Casas brancas de Santorini junto ao mar", kind: "single" },
  { title: "Viajar é mais do que chegar a um lugar.", body: "É tudo aquilo que acontece enquanto você está lá.", image: "/home/paris.jpg", alt: "Paris ao entardecer", kind: "photos" },
  { title: "Alguns souvenirs lembram onde você esteve.", highlight: "Os seus vão lembrar tudo o que você viveu.", body: "Fotos, momentos e histórias, guardados junto daquele lugar.", image: "/home/amalfi.jpg", alt: "Costa Amalfitana vista do mar", kind: "map" },
  { title: "Cada viagem deixa uma marca.", body: "E cada marca pode guardar uma história.", secondaryBody: "Conecte suas memórias aos lugares onde tudo aconteceu.", image: "/home/capri.jpg", alt: "Mar azul na ilha de Capri", kind: "phone" },
  { title: "Um simples toque pode levar você de volta para aquele momento.", body: "Aproxime o celular da sua tag NFC e reviva a memória ligada àquele lugar.", image: "/home/venice.jpg", alt: "Canal de Veneza", kind: "nfc" },
  { title: "Algumas memórias merecem mais do que ficar no rolo da câmera.", body: "Elas merecem um lugar para voltar.", image: "/home/machu.jpg", alt: "Machu Picchu entre as montanhas", kind: "memories" },
] as const;

const ROUTE = "M 500 8 C 690 45 835 76 805 135 C 780 195 260 205 205 275 C 150 345 730 350 790 425 C 850 500 295 505 205 575 C 115 645 730 655 800 730 C 870 805 320 820 230 890 C 195 918 390 948 500 960";
const MOBILE_ROUTE = "M 800 5 C 640 25 180 65 100 135 C 15 200 800 205 900 260 C 1000 320 200 330 100 392 C 0 455 800 465 900 522 C 1000 585 200 590 100 652 C 0 715 800 725 900 782 C 1000 850 730 930 500 960";

function StoryVisual({ stop }: { stop: (typeof stops)[number] }) {
  if (stop.kind === "map") {
    return (
      <div className={styles.mapScene} aria-label="Mapa ilustrado da Costa Amalfitana com paradas em Positano, Amalfi e Ravello">
        <div className={styles.mapHeading}><span>ITÁLIA · CAMPANIA</span><strong>Costa Amalfitana</strong></div>
        <svg viewBox="0 0 420 250" role="img" aria-hidden="true">
          <path className={styles.mapLand} d="M0 0h420v34c-28 3-37 18-57 24-20 7-27 3-42 14-19 14-21 29-45 35-20 5-29-4-48 9-17 12-18 28-38 36-17 7-31 1-45 14-15 14-12 31-28 45-17 15-33 12-46 28-10 12-8 22-20 31H0z" />
          <path className={styles.mapRoad} d="M30 35c56 38 106 12 160 47s98 1 190 31M15 100c54-21 80 45 136 26s89-37 147-2 83 6 110 30M43 227c25-43 61-61 99-66s74-44 96-74m74 142c-23-41-13-74 13-104s29-64 38-94" />
          <path className={styles.mapRoute} d="M82 190c38-3 52-34 91-38s51-30 88-32 48-31 78-48" />
          <circle className={styles.mapPin} cx="82" cy="190" r="7" /><circle className={styles.mapPin} cx="173" cy="152" r="7" /><circle className={styles.mapPin} cx="261" cy="120" r="7" /><circle className={styles.mapPin} cx="339" cy="72" r="7" />
          <text className={styles.mapPlace} x="50" y="218">Positano</text><text className={styles.mapPlace} x="145" y="178">Amalfi</text><text className={styles.mapPlace} x="238" y="145">Ravello</text>
        </svg>
        <span className={styles.mapLabel}>3 lugares · 1 história para reviver</span>
      </div>
    );
  }

  if (stop.kind === "phone") {
    return (
      <div className={styles.phoneScene}>
        <div className={styles.phone} aria-label="Exemplo ilustrativo de uma memória no Moments Forever">
          <div className={styles.phoneIsland} />
          <Image src={stop.image} alt={stop.alt} width={700} height={900} sizes="(max-width: 720px) 60vw, 300px" />
          <div className={styles.phoneCopy}><span>VIAGEM · ITÁLIA</span><strong>Um verão para lembrar</strong><small>Capri · 18 de junho</small></div>
        </div>
        <span className={styles.phoneNote}>suas memórias, no seu tempo</span>
      </div>
    );
  }

  if (stop.kind === "nfc") {
    return (
      <div className={styles.nfcScene}>
        <div className={styles.nfcTag}><span className={styles.nfcWave}>)))</span><span>NFC</span><small>TOQUE PARA REVIVER</small></div>
        <span className={styles.nfcArrow} aria-hidden="true">→</span>
        <div className={styles.nfcPhone}><div className={styles.nfcScreen}><Image src={stop.image} alt={stop.alt} width={360} height={440} sizes="120px" /><span>Veneza</span></div><span className={styles.nfcPhoneBase} /></div>
        <span className={styles.nfcSpark} aria-hidden="true">✦</span>
      </div>
    );
  }

  if (stop.kind === "photos" || stop.kind === "memories") {
    const photos = stop.kind === "photos"
      ? [["/home/paris.jpg", "Paris"], ["/home/tokyo.jpg", "Tóquio"], ["/home/santorini.jpg", "Santorini"]] as const
      : [["/home/machu.jpg", "Machu Picchu"], ["/home/amalfi.jpg", "Amalfi"], ["/home/venice.jpg", "Veneza"]] as const;
    return <div className={styles.photoScatter}>{photos.map(([src, label], index) => <figure className={styles.scatterPhoto} key={src} style={{ "--photo-angle": `${(index - 1) * 7}deg`, "--photo-delay": `${index * 110}ms` } as React.CSSProperties}><Image src={src} alt={`${label}, uma memória de viagem`} width={600} height={760} sizes="(max-width: 720px) 34vw, 220px" /><figcaption>{label}</figcaption></figure>)}</div>;
  }

  return <figure className={styles.singlePhoto}><Image src={stop.image} alt={stop.alt} width={900} height={1100} sizes="(max-width: 720px) 76vw, 390px" /><figcaption>um lugar que ficou com você</figcaption></figure>;
}

export function TravelJourney() {
  const journeyRef = useRef<HTMLElement>(null);
  const routeRef = useRef<SVGPathElement>(null);
  const mobileRouteRef = useRef<SVGPathElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = journeyRef.current;
    const initialRoute = routeRef.current;
    const plane = planeRef.current;
    if (!section || !initialRoute || !plane) return;
    let route: SVGPathElement = initialRoute;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let routeLength = route.getTotalLength();
    route.style.strokeDasharray = `${routeLength}`;
    let frame = 0;
    let progress = 0;
    let flightDirection = 1;

    const render = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const sectionTop = rect.top + window.scrollY;
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const nextProgress = reduced.matches ? 1 : Math.max(0, Math.min(1, -rect.top / travel));
      if (nextProgress < progress - 0.00001) flightDirection = -1;
      else if (nextProgress > progress + 0.00001) flightDirection = 1;
      progress = nextProgress;
      const activeRoute = window.matchMedia("(max-width: 719px)").matches ? mobileRouteRef.current : routeRef.current;
      if (activeRoute && activeRoute !== route) {
        route = activeRoute;
        routeLength = route.getTotalLength();
        route.style.strokeDasharray = `${routeLength}`;
      }
      const targetY = 8 + 952 * progress;
      let low = 0;
      let high = routeLength;
      for (let iteration = 0; iteration < 14; iteration += 1) {
        const middle = (low + high) / 2;
        if (route.getPointAtLength(middle).y < targetY) low = middle;
        else high = middle;
      }
      const pathDistance = (low + high) / 2;
      route.style.strokeDashoffset = `${routeLength - pathDistance}`;
      const point = route.getPointAtLength(pathDistance);
      const tangentSpan = Math.max(1, routeLength * 0.002);
      const tangentStart = route.getPointAtLength(Math.max(0, pathDistance - tangentSpan));
      const tangentEnd = route.getPointAtLength(Math.min(routeLength, pathDistance + tangentSpan));
      const angle = Math.atan2(
        (tangentEnd.y - tangentStart.y) * section.offsetHeight,
        (tangentEnd.x - tangentStart.x) * section.clientWidth,
      ) * (180 / Math.PI);
      plane.style.left = `${point.x / 10}%`;
      plane.style.top = `${point.y / 10}%`;
      plane.style.transform = `translate(-50%, -50%) rotate(${angle + 45 + (flightDirection < 0 ? 180 : 0)}deg)`;
      section.style.setProperty("--journey-progress", `${progress}`);
      section.querySelectorAll<HTMLElement>("[data-stop]").forEach((node) => {
        const nodeTop = node.getBoundingClientRect().top + window.scrollY;
        const distance = nodeTop - sectionTop;
        const threshold = Math.max(0, Math.min(1, (distance - window.innerHeight * 0.68) / travel));
        node.dataset.arrived = progress >= threshold ? "true" : "false";
      });
      section.querySelectorAll<SVGCircleElement>("[data-route-point]").forEach((node) => {
        const threshold = Number(node.dataset.routePoint) / (stops.length + 1);
        node.dataset.arrived = progress >= threshold ? "true" : "false";
      });
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    render();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    reduced.addEventListener("change", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      reduced.removeEventListener("change", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className={styles.journey} ref={journeyRef} aria-labelledby="journey-title">
        <svg className={styles.routeSvg} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          <path className={`${styles.routeBase} ${styles.desktopRoute}`} d={ROUTE} />
          <path className={`${styles.routeProgress} ${styles.desktopRoute}`} ref={routeRef} d={ROUTE} />
          <path className={`${styles.routeBase} ${styles.mobileRoute}`} d={MOBILE_ROUTE} />
          <path className={`${styles.routeProgress} ${styles.mobileRoute}`} ref={mobileRouteRef} d={MOBILE_ROUTE} />
          <g className={`${styles.routePoints} ${styles.desktopRoute}`}>
            {[[805, 135], [205, 275], [790, 425], [205, 575], [800, 730], [230, 890]].map(([x, y], index) => (
              <circle cx={x} cy={y} data-route-point={index + 1} key={`${x}-${y}`} r="5" />
            ))}
          </g>
          <g className={`${styles.routePoints} ${styles.mobileRoute}`}>
            {[[100, 135], [900, 260], [100, 392], [900, 522], [100, 652], [900, 782]].map(([x, y], index) => (
              <circle cx={x} cy={y} data-route-point={index + 1} key={`${x}-${y}`} r="5" />
            ))}
          </g>
      </svg>
      <div className={styles.plane} ref={planeRef} aria-hidden="true">
          <Image src="/home/airplane-v2.png" alt="" fill sizes="128px" priority />
      </div>
      <div className={styles.journeyInner}>
        <header className={`${styles.intro} ${styles.storyRow}`} data-stop="0">
          <span className={styles.eyebrow}>Memórias em movimento</span>
          <h2 id="journey-title">Alguns lugares viram memórias para sempre.</h2>
          <p>O Moments Forever transforma suas viagens em memórias que você pode reviver.</p>
        </header>
        {stops.map((stop, index) => (
          <article className={`${styles.storyRow} ${index % 2 ? styles.reverse : ""}`} data-stop={index + 1} key={stop.kind}>
            <div className={styles.storyVisual}><StoryVisual stop={stop} /></div>
            <div className={styles.storyCopy}>
              <span className={styles.stopNumber}>0{index + 1} / 06</span>
              <h3>{stop.title}{"highlight" in stop && <em>{stop.highlight}</em>}</h3>
              {stop.body && <p>{stop.body}</p>}
              {"secondaryBody" in stop && <p className={styles.secondaryBody}>{stop.secondaryBody}</p>}
            </div>
          </article>
        ))}
        <footer className={`${styles.finale} ${styles.storyRow}`} data-stop="7">
          <div className={styles.finalMap} aria-hidden="true"><span /><span /><span /><span /><span /></div>
          <h2>Algumas viagens terminam.<br /><em>As memórias não.</em><br />Guarde cada momento para voltar quando quiser.</h2>
          <p className={styles.finalBrand}>Moments Forever <span>colecione momentos, não coisas.</span></p>
          <HomePrimaryCta className={styles.finalCta} />
        </footer>
      </div>
    </section>
  );
}
