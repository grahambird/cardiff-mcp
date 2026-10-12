import Image from "next/image";
import logo from "./mcp-logo.png";
import background from "./background.png";
import styles from "./page.module.css";

const endpoint = "https://mcp.wales/mcp";
const capabilities = [
  {
    title: "Food hygiene",
    description: "Find Cardiff food businesses by name, business type or minimum hygiene rating, then look up an individual business’s inspection details and official FSA record.",
    prompts: ["Find cafés in Cardiff with a food hygiene rating of 5", "Which Costa has the best hygiene rating?", "Which restaurants have out of date inspections?"],
    note: "Café searches use the FSA’s broader Restaurant/Cafe/Canteen category.",
  },
  {
    title: "Schools",
    description: "Explore Cardiff schools by name, school phase or language provision. Get details including addresses and contact numbers.",
    prompts: ["Find Welsh-medium primary schools in Cardiff", "What is the phone number for Cardiff High School?", "List Cardiff secondary schools"],
    note: "Welsh-medium and dual-language groups include transitional provision; results retain the published labels.",
  },
];

export default function Home() {
  return (
    <div className={styles.canvas}>
      <Image className={styles.background} src={background} alt="" aria-hidden="true" sizes="(max-width: 680px) 476px, (max-width: 923px) 672px, (max-width: 1385px) 72.8vw, 1008px" />
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>ChatGPT Plugin</p>
        <h1 className={styles.brand}>
          <Image className={styles.logo} src={logo} alt="" />
          <span>Cardiff MCP</span>
        </h1>
        <p className={styles.intro}>Give your AI assistant local knowledge.</p>
        <p className={styles.summary}>An open-source, read-only connector that gives compatible AI assistants access to detailed information about Cardiff, Wales.</p>
        <nav className={styles.actions} aria-label="Useful links">
          <a className={styles.primaryLink} href="#connect">Connect your assistant <span aria-hidden="true">↓</span></a>
          <a href="https://github.com/grahambird/cardiff-mcp">View on GitHub <span aria-hidden="true">↗</span></a>
        </nav>
      </header>
      <section className={`${styles.section} ${styles.askSection}`} aria-labelledby="prompts-heading">
        <h2 id="prompts-heading">What to ask</h2>
        <p>Once connected, try these prompts in your assistant.</p>
        <div className={styles.cards}>
          {capabilities.map((capability) => (
            <article className={styles.card} key={capability.title}>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
              <ul className={styles.prompts}>{capability.prompts.map((prompt) => <li key={prompt}>“{prompt}”</li>)}</ul>
              <p className={styles.note}>{capability.note}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="connect" className={`${styles.section} ${styles.connect}`} aria-labelledby="connect-heading">
        <p className={styles.eyebrow}>Get connected</p>
        <h2 id="connect-heading">Add to your AI assistant</h2>
        <p>Add this server URL in a compatible MCP client. The connection uses Streamable HTTP and requires no authentication.</p>
        <a className={styles.endpoint} href={endpoint}><code>{endpoint}</code></a>
        <p className={styles.note}>MCP (Model Context Protocol) lets AI assistants use external tools and data. This URL is a server endpoint for your client; use the prompts above in your assistant after connecting.</p>
      </section>
      <section className={styles.section} aria-labelledby="tools-heading">
        <h2 id="tools-heading">Tools included</h2>
        <dl className={styles.tools}>
          <div><dt><code>find_food_businesses</code></dt><dd>Search Cardiff food businesses by name, broad business type and minimum hygiene rating.</dd></div>
          <div><dt><code>get_food_business</code></dt><dd>Retrieve inspection details for a Cardiff business using its FSA establishment ID, typically from a search result.</dd></div>
          <div><dt><code>find_schools</code></dt><dd>Search the Cardiff maintained-school directory by name, phase and language group.</dd></div>
        </dl>
      </section>
      <section className={styles.section} aria-labelledby="sources-heading">
        <h2 id="sources-heading">About the data</h2>
        <p>Food hygiene ratings come from the <a href="https://ratings.food.gov.uk/">Food Standards Agency</a> and reflect standards found on the inspection date. They do not assess food quality or provide menus, opening hours, bookings or availability. Ratings can change; results include inspection dates and official source links.</p>
        <p>School details come from a manually refreshed snapshot of the <a href="https://www.gov.wales/addresses-and-phone-numbers-schools-and-pupil-referral-units">Welsh Government school register</a>. Results include publication and import dates. This is directory information, not live school status, catchments, pupil statistics, inspections or performance results.</p>
        <p className={styles.note}>Contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>. Sources: Food Standards Agency and Welsh Government.</p>
      </section>
      <footer className={styles.footer}>
        <span>Cardiff MCP · Open source · Read only</span>
        <a href="https://github.com/grahambird/cardiff-mcp">Code and documentation on GitHub</a>
      </footer>
    </main>
    </div>
  );
}
