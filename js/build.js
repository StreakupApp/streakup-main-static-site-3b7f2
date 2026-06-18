const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..'); // project root, one level up from /js
const COMPONENTS_DIR = path.join(ROOT, 'components');

// Every page file, relative to ROOT
const pageFiles = [
    'index.html',
    'account-deletion/index.html',
    'contact/index.html',
    'feature-request/index.html',
    'privacy-policy/index.html',
    'report-a-problem/index.html',
    'terms-of-service/index.html',
    'instagram.html',
    'tiktok.html',
    'X.html',
    '404.html'
];

const componentMap = {
    'navigation': 'navigation.html',
    'floating-bar': 'floating-bar.html',
    'footer': 'footer.html'
};

function buildPage(relativePath) {
    const fullPath = path.join(ROOT, relativePath);
    if (!fs.existsSync(fullPath)) {
        console.warn(`Skipped (not found): ${relativePath}`);
        return;
    }

    let html = fs.readFileSync(fullPath, 'utf8');
    let changed = false;

    for (const [name, componentFile] of Object.entries(componentMap)) {
        const regex = new RegExp(
            `<!-- COMPONENT:${name} -->[\\s\\S]*?<!-- /COMPONENT:${name} -->`
        );
        if (!regex.test(html)) continue; // this page doesn't use this component

        const componentHtml = fs.readFileSync(
            path.join(COMPONENTS_DIR, componentFile),
            'utf8'
        );

        html = html.replace(
            regex,
            `<!-- COMPONENT:${name} -->\n${componentHtml}\n<!-- /COMPONENT:${name} -->`
        );
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(fullPath, html);
        console.log(`Built: ${relativePath}`);
    } else {
        console.log(`No components found, skipped: ${relativePath}`);
    }
}

pageFiles.forEach(buildPage);
console.log('Build complete.');