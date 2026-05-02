package crawler

import (
	"bytes"
	"net/url"
	"strings"

	"golang.org/x/net/html"
)

func extractLinks(pageURL string, body []byte) []Link {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil
	}

	var links []Link
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "a":
				link := Link{Tag: "a"}
				for _, attr := range n.Attr {
					switch attr.Key {
					case "href":
						link.Href = attr.Val
					case "rel":
						link.Rel = attr.Val
					}
				}
				if n.FirstChild != nil {
					link.Text = extractText(n)
				}
				if link.Href != "" {
					if strings.HasPrefix(link.Href, "#") {
						link.Anchor = true
					} else {
						link.External = isExternal(pageURL, link.Href)
					}
					links = append(links, link)
				}

			case "img", "source":
				// Extract src attribute
				src := getNodeAttr(n, "src")
				if src != "" && n.Data == "img" {
					links = append(links, makeResourceLink(pageURL, src, n.Data))
				}
				// Extract srcset attribute
				srcset := getNodeAttr(n, "srcset")
				if srcset != "" {
					for _, u := range parseSrcset(srcset) {
						links = append(links, makeResourceLink(pageURL, u, n.Data))
					}
				}

			case "iframe", "frame":
				src := getNodeAttr(n, "src")
				if src != "" {
					links = append(links, makeResourceLink(pageURL, src, n.Data))
				}

			case "script":
				src := getNodeAttr(n, "src")
				if src != "" {
					links = append(links, makeResourceLink(pageURL, src, n.Data))
				}

			case "track":
				src := getNodeAttr(n, "src")
				if src != "" {
					links = append(links, makeResourceLink(pageURL, src, n.Data))
				}
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return links
}

// makeResourceLink creates a resource Link from a URL and tag name.
func makeResourceLink(pageURL, href, tag string) Link {
	link := Link{
		Href:     href,
		Resource: true,
		Tag:      tag,
	}
	if strings.HasPrefix(href, "#") {
		link.Anchor = true
	} else {
		link.External = isExternal(pageURL, href)
	}
	return link
}

// parseSrcset parses the srcset attribute value and returns URLs.
// srcset format: "url1 1x, url2 2x" or "url1 300w, url2 600w"
func parseSrcset(srcset string) []string {
	var urls []string
	for _, candidate := range strings.Split(srcset, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		// Each candidate is "URL [descriptor]"
		parts := strings.Fields(candidate)
		if len(parts) >= 1 && parts[0] != "" {
			urls = append(urls, parts[0])
		}
	}
	return urls
}

// getNodeAttr returns the value of an attribute on an HTML node.
func getNodeAttr(n *html.Node, key string) string {
	for _, attr := range n.Attr {
		if attr.Key == key {
			return attr.Val
		}
	}
	return ""
}

func extractForms(body []byte) []Form {
	doc, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil
	}

	var forms []Form
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "form" {
			form := Form{Method: "GET"}
			for _, attr := range n.Attr {
				switch attr.Key {
				case "action":
					form.Action = attr.Val
				case "method":
					form.Method = strings.ToUpper(attr.Val)
				case "id":
					form.ID = attr.Val
				}
			}
			form.Inputs = extractInputs(n)
			form.HasCSRF = hasCSRFToken(form.Inputs)
			forms = append(forms, form)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)
	return forms
}

func extractInputs(formNode *html.Node) []FormInput {
	var inputs []FormInput
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && (n.Data == "input" || n.Data == "textarea" || n.Data == "select") {
			input := FormInput{}
			for _, attr := range n.Attr {
				switch attr.Key {
				case "name":
					input.Name = attr.Val
				case "type":
					input.Type = attr.Val
				case "required":
					input.Required = true
				case "value":
					input.Value = attr.Val
				}
			}
			inputs = append(inputs, input)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(formNode)
	return inputs
}

func hasCSRFToken(inputs []FormInput) bool {
	csrfNames := []string{"csrf", "_token", "authenticity_token", "csrfmiddlewaretoken", "_csrf"}
	for _, input := range inputs {
		if input.Type == "hidden" {
			name := strings.ToLower(input.Name)
			for _, csrf := range csrfNames {
				if strings.Contains(name, csrf) {
					return true
				}
			}
		}
	}
	return false
}

func extractText(n *html.Node) string {
	var buf strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			buf.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return strings.TrimSpace(buf.String())
}

func isExternal(pageURL, href string) bool {
	if strings.HasPrefix(href, "//") || strings.HasPrefix(href, "http://") || strings.HasPrefix(href, "https://") {
		baseParsed, err := url.Parse(pageURL)
		if err != nil {
			return false
		}
		hrefParsed, err := url.Parse(href)
		if err != nil {
			return false
		}
		return hrefParsed.Host != "" && hrefParsed.Host != baseParsed.Host
	}
	return false
}
