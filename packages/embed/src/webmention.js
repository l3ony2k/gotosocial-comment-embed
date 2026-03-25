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
    if (e.content && e.content.text) {
      var text = esc(e.content.text);
      if (wordcount > 0) {
        var words = text.replace(/\s+/g," ").split(" ");
        if (words.length > wordcount) {
          words = words.slice(0, wordcount);
          words[words.length-1] += "&hellip;";
        }
        text = words.join(" ");
      }
      content = '<div class="fedi-comment-text"><p>'+text+'</p></div>';
    } else if (e.name) {
      content = '<div class="fedi-comment-text"><p>'+esc(e.name)+'</p></div>';
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
      apiUrl += "&target[]="+encodeURIComponent("http:"+t)
             +"&target[]="+encodeURIComponent("https:"+t);
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
