#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const INDEX = path.join(ROOT, "index.html");
const REFERENCE = "index.html";
const SITE = "https://streakrise.com";
const AUTHOR = "Mark Kirner";
const NEWEST_FIRST = !process.argv.includes("--oldest");

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");
const slugify = s => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pretty = iso => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const localImagePath = url => url.startsWith("/") ? path.join(ROOT, url.slice(1)) : path.join(ROOT, url);

// Only advertise responsive variants when those files actually exist.
// Supported convention: image-640.jpg, image-960.jpg, image-1280.jpg.
// Variants must use the same extension as the original image.
function imageSrcset(url) {
    if (!url || /^https?:\/\//i.test(url)) return "";

    const ext = path.extname(url);
    if (!ext) return "";

    const stem = url.slice(0, -ext.length);

    return [640, 960, 1280]
        .map(width => ({
            width,
            candidate: `${stem}-${width}${ext}`,
        }))
        .filter(item => fs.existsSync(localImagePath(item.candidate)))
        .map(item => `${item.candidate} ${item.width}w`)
        .join(", ");
}

function responsiveImageAttrs(url, sizes) {
    const srcset = imageSrcset(url);
    return srcset
        ? ` srcset="${esc(srcset)}" sizes="${esc(sizes)}"`
        : "";
}

const byDate = (a, b) =>
    (Date.parse(a.published) - Date.parse(b.published)) *
    (NEWEST_FIRST ? -1 : 1);

function meta(s, prop) {
    const p = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = s.match(
        new RegExp(`<meta (?:property|name)="${p}"\\s+content="([^"]*)"`)
    );

    return m ? unesc(m[1]) : "";
}

// Convert an existing hand-written post into metadata.
function readPost(dir) {
    const s = fs.readFileSync(
        path.join(ROOT, dir, "index.html"),
        "utf8"
    );

    const ldMatch = s.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );

    const ld = ldMatch ? JSON.parse(ldMatch[1]) : {};

    const imgTag = s.match(
        /<img\b(?=[^>]*class="blog-post-image)[^>]*>/
    );

    const imgSrc = imgTag && imgTag[0].match(/\bsrc="([^"]+)"/);
    const imgAlt = imgTag && imgTag[0].match(/\balt="([^"]*)"/);

    const rt = s.match(/blog-post-read-time">[^\d]*(\d+) min read/);

    return {
        slug: dir,
        title: meta(s, "og:title"),
        desc: meta(s, "og:description"),
        category: meta(s, "article:section"),
        published: ld.datePublished,
        modified: ld.dateModified || ld.datePublished,
        image: imgSrc ? imgSrc[1] : "",
        alt: imgAlt ? unesc(imgAlt[1]) : "",
        read: rt ? rt[1] : "5",
        ogImage: ld.image || "",
        summary: "",
        productHeading: "",
        productText: "",
        tags: [],
        words: undefined,
    };
}

// Parse a Markdown source file into metadata and article body.
function parseMd(file) {
    const raw = fs.readFileSync(file, "utf8")
        .replace(/\r\n/g, "\n");

    const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);

    if (!m) {
        throw new Error(`${file}: missing frontmatter`);
    }

    const fm = {};

    m[1].split("\n").forEach(line => {
        const i = line.indexOf(":");

        if (i > 0) {
            fm[line.slice(0, i).trim()] =
                line.slice(i + 1).trim();
        }
    });

    const slug = fm.slug || path.basename(file, ".md");
    const body = raw.slice(m[0].length);
    const wordCount = body.split(/\s+/).filter(Boolean).length;

    if (!fm.title) {
        throw new Error(`${file}: missing title in frontmatter`);
    }

    if (!fm.description) {
        throw new Error(`${file}: missing description in frontmatter`);
    }

    if (!fm.date) {
        throw new Error(`${file}: missing date in frontmatter`);
    }

    const published = fm.date.length === 10
        ? `${fm.date}T10:00:00+00:00`
        : fm.date;

    const modified = fm.modified
        ? (
            fm.modified.length === 10
                ? `${fm.modified}T10:00:00+00:00`
                : fm.modified
        )
        : published;

    return {
        slug,
        title: fm.title,
        desc: fm.description,
        category: fm.category || "Blog",
        published,
        modified,

        // Optional frontmatter fields.
        summary: fm.summary || "",
        productHeading: fm.product_heading || "",
        productText: fm.product_text || "",

        image: `/blog/assets/${fm.cover || slug + "/cover.jpg"}`,
        ogImage: `${SITE}/assets/blog/${fm.og || slug + "/og.jpg"}`,
        alt: fm.alt || fm.title,
        read: String(Math.max(1, Math.ceil(wordCount / 200))),
        words: wordCount,
        tags: (fm.tags || "")
            .split(",")
            .map(t => t.trim())
            .filter(Boolean),
        body,
    };
}
function renderImageMarkers(body, post) {
    return body.replace(
        /\{\{image:\s*([a-z0-9_-]+)\s*\}\}/gi,
        (_, imageName) => {
            const imageDir = path.join(
                ROOT,
                "assets",

                post.slug
            );

            const extensions = [".webp", ".png", ".jpg", ".jpeg"];

            const filename = extensions
                .map(ext => imageName + ext)
                .find(name =>
                    fs.existsSync(path.join(imageDir, name))
                );

            if (!filename) {
                throw new Error(
                    `Image "${imageName}" not found for article "${post.slug}". ` +
                    `Searched: ${extensions.join(", ")} in ${imageDir}`
                );
            }

            const imageUrl =
                `/blog/assets/${post.slug}/${filename}`;

            const alt = imageName
                .replace(/[-_]+/g, " ")
                .replace(/\b\w/g, char => char.toUpperCase());

            return `<p class="blog-inline-image">
                <img
                    src="${imageUrl}"
                    alt="${esc(alt)}"
                    loading="lazy"
                    decoding="async"${responsiveImageAttrs(imageUrl, "(max-width: 900px) 100vw, 760px")}>
            </p>`;
        }
    );
}

function renderPost(p, related, top, bottom) {
    const url = `${SITE}/blog/${p.slug}/`;
    const heroSizes = "(max-width: 900px) 100vw, 900px";
    const heroSrcset = imageSrcset(p.image);
    const toc = [];

    const tracked = html => html.replace(
        /<a href="(https:\/\/streakrise\.com\/?)"/g,
        (_, u) =>
            `<a href="${u}?utm_source=streakrise_blog&utm_medium=article&utm_campaign=blog_${p.slug.replace(/-/g, "_")}" data-track="inline_cta"`
    );

    const content = tracked(
        marked.parse(renderImageMarkers(p.body, p))
    )
        .split(/(?=<h2>)/)
        .filter(x => x.trim())
        .map(part => {
            const h = part.match(/^<h2>(.*?)<\/h2>/);

            if (!h) {
                return `<section class="scroll-animate">\n${part}</section>`;
            }

            const id = slugify(h[1]);
            toc.push({ id, text: h[1] });

            return `<section id="${id}" class="scroll-animate">\n${part}</section>`;
        })
        .join("\n\n");

    const ld = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: p.title,
        description: p.desc,
        image: p.ogImage,
        datePublished: p.published,
        dateModified: p.modified || p.published,
        author: {
            "@type": "Person",
            name: AUTHOR,
        },
        publisher: {
            "@type": "Organization",
            name: "StreakRise",
            logo: {
                "@type": "ImageObject",
                url: `${SITE}/assets/icon.png`,
            },
        },
        mainEntityOfPage: {
            "@type": "WebPage",
            "@id": url,
        },
        articleSection: p.category,
        keywords: p.tags,
        wordCount: p.words,
    }, null, 2);

    const bcLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: `${SITE}/`,
            },
            {
                "@type": "ListItem",
                position: 2,
                name: "Blog",
                item: `${SITE}/blog/`,
            },
            {
                "@type": "ListItem",
                position: 3,
                name: p.title,
                item: url,
            },
        ],
    }, null, 2);

    const relatedHtml = related.map(r => `
                    <a href="/blog/${r.slug}/" class="related-post-card">
                        <img
                            src="${esc(r.image)}"${responsiveImageAttrs(r.image, "(max-width: 700px) 90vw, 320px")}
                            alt="${esc(r.alt)}"
                            class="related-post-image"
                            loading="lazy">
                        <div class="related-post-content">
                            <h3 class="related-post-title">${esc(r.title)}</h3>
                            <time class="related-post-date" datetime="${r.published.slice(0, 10)}">${pretty(r.published)}</time>
                        </div>
                    </a>
    `).join("\n");

    const e = esc;

    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>${e(p.title)} | StreakRise Blog</title>

    <link rel="icon" href="/assets/icons/website/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/website/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/website/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/website/apple-touch-icon.png">

    <meta property="og:site_name" content="StreakRise">
    <meta name="description" content="${e(p.desc)}">
    <link rel="canonical" href="${url}">

    <link
        rel="preload"
        as="image"
        href="${e(p.image)}"${heroSrcset ? `
        imagesrcset="${e(heroSrcset)}"
        imagesizes="${heroSizes}"` : ""}
        fetchpriority="high">

    <meta property="og:title" content="${e(p.title)}">
    <meta property="og:description" content="${e(p.desc)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${e(p.ogImage)}">
    <meta property="og:image:secure_url" content="${e(p.ogImage)}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${e(p.alt)}">

    <meta property="article:published_time" content="${e(p.published)}">
    <meta property="article:modified_time" content="${e(p.modified || p.published)}">
    <meta property="article:author" content="${AUTHOR}">
    <meta property="article:section" content="${e(p.category)}">
    <meta property="article:tag" content="${e(p.tags.join(", "))}">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${e(p.title)}">
    <meta name="twitter:description" content="${e(p.desc)}">
    <meta name="twitter:image" content="${e(p.ogImage)}">
    <meta name="twitter:image:alt" content="${e(p.alt)}">

    <link rel="manifest" href="/assets/icons/website/site.webmanifest">
    <link rel="shortcut icon" href="/assets/icons/website/favicon.ico">

    <link rel="stylesheet" href="/css/navigation.css">
    <link rel="stylesheet" href="/css/footer.css">
    <link rel="stylesheet" href="/css/floating-bar.css">
    <link rel="stylesheet" href="/streakrise-styles.css?v=7">
    <link rel="stylesheet" href="/css/blog.css?v=10">

    <script src="/components/analytics.js" defer></script>
    <script src="/js/scroll_effect.js" defer></script>

    <script type="application/ld+json">
${ld}
    </script>

    <script type="application/ld+json">
${bcLd}
    </script>
</head>

<body>
${top}
    <article class="blog-post">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span aria-hidden="true">/</span>
            <a href="/blog/">Blog</a>
            <span aria-hidden="true">/</span>
            <span class="breadcrumbs-current" aria-current="page">${e(p.title)}</span>
        </nav>

        <header class="blog-post-header scroll-animate">
            <a href="/blog/" class="blog-post-category">${e(p.category)}</a>
            <h1 class="blog-post-title">${e(p.title)}</h1>

            <div class="blog-post-meta">
                <span class="blog-post-author">
                    <span class="blog-post-author-name">${AUTHOR}</span>
                </span>

                <time class="blog-post-date" datetime="${p.published.slice(0, 10)}">${pretty(p.published)}</time>
                <span class="blog-post-read-time">⏱ ${p.read} min read</span>
            </div>
        </header>

        <img
            src="${e(p.image)}"${responsiveImageAttrs(p.image, heroSizes)}
            alt="${e(p.alt)}"
            class="blog-post-image scroll-animate"
            loading="eager"
            fetchpriority="high">

${p.summary ? `
        <aside class="article-summary scroll-animate" aria-label="Article summary">
            <p class="article-summary-label">The short answer</p>
            <p>${e(p.summary)}</p>
        </aside>
` : ""}

${toc.length ? `
        <nav class="table-of-contents scroll-animate" aria-label="Table of contents">
            <details>
                <summary class="table-of-contents-title">In this article</summary>
                <ul class="table-of-contents-list">
${toc.map(t => `                    <li><a href="#${t.id}">${t.text}</a></li>`).join("\n")}
                </ul>
            </details>
        </nav>
` : ""}

        <div class="blog-post-content">
${content}
        </div>

${p.productHeading && p.productText ? `
        <section class="article-product-section scroll-animate" aria-labelledby="article-product-heading">
            <h2 id="article-product-heading">${e(p.productHeading)}</h2>
            <p>${e(p.productText)}</p>
            <p><a href="/" data-track="product_section">Explore StreakRise</a></p>
        </section>
` : ""}

        <footer class="blog-post-footer scroll-animate">
           ${p.tags.length ? `
            <div class="blog-post-tags" aria-label="Article topics">
${p.tags.map(t => `                <span class="blog-post-tag">${e(t)}</span>`).join("\n")}
            </div>
` : ""}

            <div class="author-bio">
                <img src="/assets/profilepic.webp" alt="${AUTHOR}" class="author-bio-avatar" loading="lazy">

                <div class="author-bio-content">
                    <p class="author-bio-name">${AUTHOR}</p>
                    <p class="author-bio-role">Developer & Founder, StreakRise</p>
                    <p class="author-bio-description">I'm a developer from Romania building beautiful apps that inspire people to take action and pursue their dreams. StreakRise was born from my own struggle with consistency, and the realization that the right tool can make all the difference.</p>
                </div>
            </div>

${related.length ? `
            <section class="related-posts">
                <h2 class="related-posts-title">You might also like</h2>
                <div class="related-posts-grid">
${relatedHtml}
                </div>
            </section>
` : ""}

            <section class="blog-post-cta scroll-animate">
                <h2 class="blog-post-cta-title">Ready to put this into practice?</h2>
                <p class="blog-post-cta-text">Start building streaks that last with StreakRise, the habit tracker that adapts to your life, not the other way around.</p>

                <div class="badge-row" style="display:flex;flex-direction:row;flex-wrap:nowrap;align-items:stretch;gap:12px;justify-content:center;">
                    <a
                        href="https://play.google.com/store/apps/details?id=com.mkaapps.streakup&utm_source=streakrise_blog&utm_medium=referral&utm_campaign=blog_${p.slug.replace(/-/g, "_")}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="play-badge"
                        aria-label="Get StreakRise on Google Play">
                        <img src="/assets/Google_Play_Store_badge_EN.svg" alt="Get it on Google Play">
                    </a>
                </div>
            </section>
        </footer>
    </article>

    <script>
    document.addEventListener('click', function (e) {
        var a = e.target.closest('a[data-track]');
        if (!a || !window.posthog) return;

        posthog.capture('blog_link_clicked', {
            slug: '${p.slug}',
            link: a.dataset.track,
            href: a.href
        });
    });
    </script>

    ${bottom}`;
}

function card(p) {
    return `    <article class="blog-card scroll-animate">
        <img
            src="${esc(p.image)}"${responsiveImageAttrs(p.image, "(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 360px")}
            alt="${esc(p.alt)}"
            class="blog-card-image"
            loading="lazy">

        <div class="blog-card-content">
            <div class="blog-card-meta">
                <span class="blog-card-category">${esc(p.category)}</span>
                <time class="blog-card-date" datetime="${p.published.slice(0, 10)}">${pretty(p.published)}</time>
            </div>

            <h2 class="blog-card-title">${esc(p.title)}</h2>
            <p class="blog-card-excerpt">${esc(p.desc)}</p>

            <div class="blog-card-footer">
                <span class="blog-card-read-time">${p.read} min read</span>
                <a href="/blog/${p.slug}/" class="blog-card-link">Read more →</a>
            </div>
        </div>
    </article>`;
}

function ldBlock(posts) {
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "StreakRise Blog",
        description: "Articles about streak philosophy, habit formation, and productivity from the creator of StreakRise",
        url: `${SITE}/blog/`,
        publisher: {
            "@type": "Organization",
            name: "StreakRise",
            logo: {
                "@type": "ImageObject",
                url: `${SITE}/assets/icon.png`,
            },
        },
        author: {
            "@type": "Person",
            name: AUTHOR,
        },
        blogPost: posts.map(p => ({
            "@type": "BlogPosting",
            headline: p.title,
            description: p.desc,
            url: `${SITE}/blog/${p.slug}/`,
            datePublished: p.published,
            dateModified: p.modified || p.published,
            author: {
                "@type": "Person",
                name: AUTHOR,
            },
            image: p.ogImage.startsWith("http")
                ? p.ogImage
                : SITE + p.ogImage,
        })),
    }, null, 2);
}

// 1. Generate pages from Markdown.
const mdPosts = fs.existsSync(SRC)
    ? fs.readdirSync(SRC)
        .filter(f => f.endsWith(".md"))
        .map(f => parseMd(path.join(SRC, f)))
    : [];

if (mdPosts.length) {
    const ref = fs.readFileSync(INDEX, "utf8");

    const bodyStart = ref.indexOf("<body>");
    const mainStart = ref.indexOf("<main>");

    if (bodyStart === -1 || mainStart === -1 || mainStart <= bodyStart) {
        throw new Error(
            "Could not extract the blog layout: index.html must contain <body> followed by <main>."
        );
    }

    const top = ref.slice(bodyStart + 6, mainStart);

    const mainEnd = ref.indexOf("</main>");
    const dividerStart = ref.indexOf(
        '<div class="divider scroll-animate"></div>',
        Math.max(0, mainEnd - 120)
    );

    if (dividerStart === -1) {
        throw new Error(
            'Could not find the expected divider in index.html to extract the blog footer.'
        );
    }

    const bottom = ref.slice(dividerStart);

    const mdSlugs = new Set(mdPosts.map(p => p.slug));

    const handMade = fs.readdirSync(ROOT, { withFileTypes: true })
        .filter(d =>
            d.isDirectory() &&
            !mdSlugs.has(d.name) &&
            fs.existsSync(path.join(ROOT, d.name, "index.html"))
        )
        .map(d => readPost(d.name));

    const all = [...handMade, ...mdPosts];

    for (const p of mdPosts) {
        const related = all
            .filter(x => x.slug !== p.slug)
            .sort(byDate)
            .slice(0, 2);

        fs.mkdirSync(path.join(ROOT, p.slug), { recursive: true });

        fs.writeFileSync(
            path.join(ROOT, p.slug, "index.html"),
            renderPost(p, related, top, bottom)
        );
    }
}

// 2. Rebuild the blog index from every post folder.
const posts = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(d =>
        d.isDirectory() &&
        fs.existsSync(path.join(ROOT, d.name, "index.html"))
    )
    .map(d => readPost(d.name))
    .sort(byDate);

let s = fs.readFileSync(INDEX, "utf8");

const cards = posts.map(card).join("\n\n");

s = s.replace(
    /(<!-- POSTS:START -->)[\s\S]*?(<!-- POSTS:END -->)/,
    (_, a, b) => `${a}\n${cards}\n    ${b}`
);

s = s.replace(
    /(<!-- LD:START -->)[\s\S]*?(<!-- LD:END -->)/,
    (_, a, b) =>
        `${a}\n<script type="application/ld+json">\n${ldBlock(posts)}\n</script>\n${b}`
);

fs.writeFileSync(INDEX, s);

console.log(`${mdPosts.length} generated, ${posts.length} total`);