// ==UserScript==
// @name         Workable OBS request view
// @namespace    https://build.opensuse.org
// @version      2025-09-22
// @description  Show a workable OBS request view
// @author       Ana Guerrero Lopez with hints from Leo GR
// @match        https://build.opensuse.org/requests/*
// @grant        GM_addStyle
// @connect      build.opensuse.org
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const paths = ['changes', 'build_results', 'mentioned_issues']; // The sub-paths you want to fetch.
    const containerId = 'extra-request-info';

    // Add custom CSS for cleaner look
    GM_addStyle(`
        #${containerId} {
            margin-top: 2em;
            padding: 1em;
            border-top: 2px solid #ccc;
        }
        #${containerId} h3 {
            margin-top: 1em;
        }
        #${containerId} .extra-section {
            border: 1px solid #ddd;
            padding: 1em;
            margin-bottom: 1.5em;
        }
        #${containerId} .loading {
            text-align: center;
            font-size: 1.2em;
            color: #888;
        }
        
        .collapse:not(.show) {
            display: block!important;
        }
    `);

    const addExternalScript = async (head, baseUrl) => {
        const scripts = head.querySelectorAll('script');
        const scriptPromises = [];

        scripts.forEach(script => {
            if (script.src) {
                // handle external script
                const promise = addScript(script, baseUrl);
                scriptPromises.push(promise);
            }
        });

        // Wait until all external scripts are loaded
        await Promise.all(scriptPromises);
    }

    const addScript = async (script, baseUrl) => {
        return new Promise((resolve, reject) => {
            const newScript = document.createElement('script');
            newScript.src = script.src;
            // Copiar atributos
            Array.from(script.attributes).forEach(attr => {
                if (attr.name !== 'src') {
                    newScript.setAttribute(attr.name, attr.value);
                }
            });

            newScript.onload = () => {
                resolve();
            };

            newScript.onerror = () => {
                reject();
            };

            document.head.appendChild(newScript);
        });
    }

    // Extract only the <div class="container p-4">
    async function sanitizeHTML(htmlText, baseUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const content = doc.querySelector('div.container.p-4');
        if (!content) return '<em>No content found</em>';
        await addExternalScript(doc.head, baseUrl);
        fixRelativeLinks(content, baseUrl);
        return content.innerHTML;
    }

    // Rewrite relative links inside extracted content
    function fixRelativeLinks(container, baseUrl) {
        container.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (href.startsWith('/')) {
                a.href = new URL(href, baseUrl).href;
            }
        });
    }

    // Create the container to display additional content
    function createContainer() {
        const container = document.createElement('div');
        container.id = containerId;

        const main = document.querySelector('#content') || document.body;
        main.appendChild(container);
    }

    // Add section to container
    function addSection(title, content) {
        const section = document.createElement('div');
        section.className = 'extra-section';

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = content;
        section.appendChild(contentDiv);

        document.getElementById(containerId).appendChild(section);
    }

    // Extract and evaluate inline scripts from HTML string
    function getAndEvalInlineScripts(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, "text/html");

        // 1. Extract inline scripts skipping the ones that have src attribute
        const rawInlineScripts = [...doc.querySelectorAll("script")]
        .filter(s => !s.hasAttribute("src"))
        .map(s => s.textContent.trim())
        .filter(code => code.length > 0);

        // 2. Process each inline script
        const inlineScripts = rawInlineScripts.map(code => {
            // We need to remove the ready function wrapper if present
            const match = code.match(/\$\(document\)\.ready\s*\(\s*function\s*\(\)\s*{([\s\S]*?)}\s*\);?/);

            if (match) {
                return match[1].trim(); // return the code inside the ready function
            }
            return code; // if no ready, return as is
        });

        console.log("Processed scripts:", inlineScripts);

        // 3. Execute the content
        inlineScripts.forEach(code => {
            try {
                eval(code);
            } catch (err) {
                // ignore errors as it would contain imports and other stuff already loaded 
                // in addScript function
            }
        });
    }

    // Fetch and insert additional content
    async function fetchAndInsert(subPath) {
        const baseUrl = window.location.origin;
        const currentUrl = window.location.href.replace(/\/$/, '');
        const url = `${currentUrl}/${subPath}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${url}. Status: ${response.status}`);
            }

            const html = await response.text();
            const sanitized = await sanitizeHTML(html, baseUrl);
            addSection(`/${subPath}`, sanitized);

            // collect all the scripts included in html
            // WARNING: not the sanitized but the original html
            // so we can eval all the scripts from the requested tab 
            getAndEvalInlineScripts(html);

        } catch (err) {
            console.error('Error fetching content:', err);
            addSection(`/${subPath}`, `<em>Error loading content: ${err.message}</em>`);
        }
    }

    // Initialize the script
    function init() {

        const introcard = document.querySelector('div.card.p-4');
        const commentslistcard = document.querySelector('div#comments-list');

        const requestTabs = document.getElementById('request-tabs');
        if (requestTabs) {
            requestTabs.remove();
        }
        const DDiv = document.querySelector('div.container.p-4');
        if (DDiv) {
            DDiv.remove();
        }

        createContainer();

        // Reinsert introcard after the container
        if (introcard) {
            const container = document.getElementById(containerId);
            container.appendChild(introcard);
        }


        // Enforce serial fetch and insertion
        (async () => {
            for (const subPath of paths) {
                await fetchAndInsert(subPath);
            }
        })();

        // Reinsert introcard after the container
        if (commentslistcard) {
            const container = document.getElementById(containerId);
            container.parentNode.insertBefore(commentslistcard, container.nextSibling);
        }

        // And finally remove the annoying buttons
        const annoyingbutton1 = document.querySelector('input.btn.btn-danger.ms-2');
        if (annoyingbutton1) {
            annoyingbutton1.remove();
        }

        const annoyingbutton2 = document.querySelector('div.btn-group.ms-2');
        if (annoyingbutton2) {
            annoyingbutton2.remove();
        }

    }


    window.addEventListener('load', init);
})();

