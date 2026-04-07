/** @preserve webmention.js

Simple thing for embedding webmentions from webmention.io into a page, client-side.

(c)2018-2020 fluffy (http://beesbuzz.biz)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

GitHub repo (for latest released versions, issue tracking, etc.):

    http://github.com/PlaidWeb/webmention.js

Modified: rendering rewritten to match fedi-comments display style.

*/
!function(){"use strict";

  function cfg(name,def){
    return(document.currentScript&&document.currentScript.getAttribute("data-"+name))||def;
  }

  var pageUrl    = cfg("page-url", window.location.href.replace(/#.*$/,""));
  var addUrls    = cfg("add-urls");
  var containerId= cfg("data-id", "webmentions");
  var wordcount  = parseInt(cfg("wordcount","0"),10)||0;
  var maxItems   = cfg("max-webmentions", 30);
  var urlField   = cfg("prevent-spoofing") ? "wm-source" : "url";

  var icons  = {"in-reply-to":"✉︎","like-of":"♡","repost-of":"↻","bookmark-of":"☆","mention-of":"✉︎",rsvp:"○","follow-of":"→"};
  var labels = {"in-reply-to":"回复","like-of":"喜欢","repost-of":"转发","bookmark-of":"书签","mention-of":"提及",rsvp:"RSVP","follow-of":"关注"};
  var rsvpIcons = {yes:"✓",no:"✗",interested:"?",maybe:"?"};

  // Fully percent-encoded SVG so it's safe inside both src="" and onerror='this.src=...'
  var PLACEHOLDER = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2236%22%20height%3D%2236%22%3E%3Crect%20width%3D%2236%22%20height%3D%2236%22%20fill%3D%22%23808080%22%2F%3E%3C%2Fsvg%3E";

  function esc(s) {
    return String(s)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;");
  }

  function stripProto(u) { return u.substr(u.indexOf("//")); }

  function dedup(arr) {
    var seen={}, out=[];
    arr.forEach(function(e){
      var k=stripProto(e.url);
      if(!seen[k]){out.push(e);seen[k]=1;}
    });
    return out;
  }

  function fmtDate(s) {
    if(!s) return "";
    var d=new Date(s);
    if(isNaN(d)) return "";
    function pad(n){return String(n).padStart(2,"0");}
    return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())
      +" "+pad(d.getHours())+":"+pad(d.getMinutes());
  }

  function unwrapTextValue(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      if (typeof value.value === "string") return value.value;
      if (typeof value.text === "string") return value.text;
    }
    return "";
  }

  function normalizeText(value) {
    var text = unwrapTextValue(value);
    if (!text) return "";

    // Some summaries include entities or inline HTML even when marked as plain text.
    if (text.indexOf("<") !== -1 || text.indexOf("&") !== -1) {
      var div = document.createElement("div");
      div.innerHTML = text;
      text = div.textContent || div.innerText || "";
    }

    return text.replace(/\s+/g, " ").trim();
  }

  function sanitizeUrl(url) {
    if (!url) return "";
    try {
      var parsed = new URL(url, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch(_) {}
    return "";
  }

  function sanitizeHtml(html) {
    if (!html) return "";

    var template = document.createElement("template");
    template.innerHTML = html;

    var allowedTags = {
      A: true, P: true, BR: true, EM: true, STRONG: true, B: true, I: true,
      BLOCKQUOTE: true, CODE: true, PRE: true, UL: true, OL: true, LI: true,
      DEL: true, INS: true, SUB: true, SUP: true, MARK: true
    };
    var allowedAttrs = {
      A: { href: true, title: true, class: true }
    };

    function cleanNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return;

      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
      }

      var tag = node.tagName;
      if (!allowedTags[tag]) {
        var parent = node.parentNode;
        if (!parent) return;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
        return;
      }

      Array.from(node.attributes).forEach(function(attr){
        var name = attr.name.toLowerCase();
        var perTag = allowedAttrs[tag] || {};
        if (!perTag[attr.name] && !perTag[name]) {
          node.removeAttribute(attr.name);
          return;
        }

        if (tag === "A" && name === "href") {
          var safeHref = sanitizeUrl(attr.value);
          if (!safeHref) {
            node.removeAttribute(attr.name);
            return;
          }
          node.setAttribute("href", safeHref);
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "nofollow noopener noreferrer");
        }
      });

      Array.from(node.childNodes).forEach(cleanNode);
    }

    Array.from(template.content.childNodes).forEach(cleanNode);

    // Strip empty anchors left behind after URL sanitization.
    template.content.querySelectorAll("a:not([href])").forEach(function(a){
      var parent = a.parentNode;
      if (!parent) return;
      while (a.firstChild) parent.insertBefore(a.firstChild, a);
      parent.removeChild(a);
    });

    return template.innerHTML.trim();
  }

  function isCompactType(prop) {
    return prop === "like-of" || prop === "repost-of" || prop === "bookmark-of" || prop === "follow-of";
  }

  function renderHtmlContent(value) {
    var html = sanitizeHtml(unwrapTextValue(value));
    if (!html) return "";
    return '<div class="fedi-comment-text">'+html+'</div>';
  }

  function getRenderedContent(e) {
    var prop = e["wm-property"] || "mention-of";
    if (isCompactType(prop)) return "";

    var summaryHtml = renderHtmlContent(e.summary);
    if (summaryHtml) return summaryHtml;

    var contentHtml = renderHtmlContent(e.content && e.content.html);
    if (contentHtml) return contentHtml;

    var summary = normalizeText(e.summary);
    if (summary) return '<div class="fedi-comment-text"><p>'+esc(summary)+'</p></div>';

    var text = normalizeText(e.content && e.content.text);
    if (text) return '<div class="fedi-comment-text"><p>'+esc(text)+'</p></div>';

    return "";
  }

  function renderEntry(e) {
    var photo      = (e.author && e.author.photo)
                  || (Array.isArray(e.photo) ? e.photo[0] : e.photo)
                  || "";
    var avatar     = photo ? esc(photo) : PLACEHOLDER;
    var authorName = esc((e.author && e.author.name) || e[urlField].split("/")[2]);
    var authorUrl  = esc((e.author && e.author.url)  || e[urlField]);
    var sourceUrl  = esc(e[urlField]);
    var domain     = esc(e[urlField].split("/")[2] || "");
    var date       = fmtDate(e.published || e["wm-received"]);
    var prop       = e["wm-property"] || "mention-of";
    var icon       = icons[prop]  || "✉︎";
    var label      = labels[prop] || "提及";
    var rsvpSub    = (e.rsvp && rsvpIcons[e.rsvp]) ? "<sub>"+rsvpIcons[e.rsvp]+"</sub>" : "";

    var content = "";
    content = getRenderedContent(e);
    if (!content && e.name && !isCompactType(prop)) {
      var text = esc(e.name);
      if (wordcount > 0) {
        var words = text.replace(/\s+/g," ").split(" ");
        if (words.length > wordcount) {
          words = words.slice(0, wordcount);
          words[words.length-1] += "&hellip;";
        }
        text = words.join(" ");
      }
      content = '<div class="fedi-comment-text"><p>'+text+'</p></div>';
    }

    return '<li class="fedi-comment">'
      + '<img class="fedi-comment-avatar" src="'+avatar+'" alt="" loading="lazy"'
      + ' onerror="this.onerror=null;this.src=\''+PLACEHOLDER+'\'">'
      + '<div class="fedi-comment-body">'
        + '<div class="fedi-comment-meta">'
          + '<span class="fedi-comment-author"><a href="'+authorUrl+'" target="_blank" rel="nofollow noopener">'+authorName+'</a></span>'
          + '<span class="fedi-comment-handle">'+domain+'</span>'
          + '<span class="fedi-comment-badge">'+icon+' '+label+'</span>'
          + rsvpSub
        + '</div>'
        + '<div class="fedi-comment-info">'
          + (date ? '<span class="fedi-comment-time"><a href="'+sourceUrl+'" target="_blank" rel="nofollow noopener">'+date+'</a></span>' : '')
        + '</div>'
        + content
      + '</div>'
      + '</li>';
  }

  window.addEventListener("load", function() {
    var container = document.getElementById(containerId);
    if (!container) return;

    var targets = [stripProto(pageUrl)];
    if (addUrls) addUrls.split("|").forEach(function(u){ targets.push(stripProto(u)); });

    var apiUrl = "https://webmention.io/api/mentions.jf2?per-page="+maxItems;
    targets.forEach(function(t){
      apiUrl += "&target[]="+encodeURIComponent("https:"+t);
    });

    function onData(data) {
      var items = dedup((data && data.children) || []);
      if (items.length === 0) { container.innerHTML = ""; return; }

      // Count by type for the header stats
      var counts = {};
      items.forEach(function(e){
        var p = e["wm-property"] || "mention-of";
        counts[p] = (counts[p] || 0) + 1;
      });

      // Build stats chips — only for types that appear, preserving display order
      var order = ["like-of","repost-of","bookmark-of","in-reply-to","mention-of","follow-of","rsvp"];
      var chips = order.filter(function(p){ return counts[p]; }).map(function(p){
        return '<span class="fedi-stats-item">'+(icons[p]||"✉︎")+' '+counts[p]+'</span>';
      }).join(" ");

      var header = '<div class="fedi-comments-header">'
        + '<span>找到了 '+items.length+' 条互动</span>'
        + (chips ? ' <span class="fedi-comment-stats-header">'+chips+'</span>' : '')
        + '</div>';

      container.innerHTML = header
        + '<ul class="fedi-comments-list">'+items.map(renderEntry).join("")+'</ul>';
    }

    if (window.fetch) {
      window.fetch(apiUrl)
        .then(function(r){ return r.ok ? r.json() : Promise.reject(r.statusText); })
        .then(onData)
        .catch(function(err){ console.error("webmention fetch failed", err); });
    } else {
      var xhr = new XMLHttpRequest();
      xhr.onload = function(){ onData(JSON.parse(xhr.responseText)); };
      xhr.onerror = function(err){ console.error("webmention fetch failed", err); };
      xhr.open("GET", apiUrl);
      xhr.send();
    }
  });

}();
