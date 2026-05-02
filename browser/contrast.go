package browser

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Color represents an RGBA color with channels in the 0-1 range.
type Color struct {
	R, G, B, A float64
}

// RelativeLuminance computes the relative luminance of a color per WCAG 2.1.
// See https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
func RelativeLuminance(c Color) float64 {
	r := linearize(c.R)
	g := linearize(c.G)
	b := linearize(c.B)
	return 0.2126*r + 0.7152*g + 0.0722*b
}

// linearize converts a single sRGB channel value (0-1) to its linear form.
func linearize(v float64) float64 {
	if v <= 0.04045 {
		return v / 12.92
	}
	return math.Pow((v+0.055)/1.055, 2.4)
}

// ContrastRatio computes the WCAG 2.1 contrast ratio between two colors.
// The result is in the range [1, 21]. Higher values indicate more contrast.
func ContrastRatio(fg, bg Color) float64 {
	l1 := RelativeLuminance(fg)
	l2 := RelativeLuminance(bg)

	lighter := math.Max(l1, l2)
	darker := math.Min(l1, l2)

	return (lighter + 0.05) / (darker + 0.05)
}

// MeetsAA checks whether the contrast ratio meets WCAG 2.1 Level AA.
// Normal text requires 4.5:1; large text (>=18pt or >=14pt bold) requires 3:1.
func MeetsAA(ratio float64, largeText bool) bool {
	if largeText {
		return ratio >= 3.0
	}
	return ratio >= 4.5
}

// MeetsAAA checks whether the contrast ratio meets WCAG 2.1 Level AAA.
// Normal text requires 7:1; large text requires 4.5:1.
func MeetsAAA(ratio float64, largeText bool) bool {
	if largeText {
		return ratio >= 4.5
	}
	return ratio >= 7.0
}

// namedColors maps CSS named colors to their hex values.
var namedColors = map[string]string{
	"black":   "#000000",
	"white":   "#ffffff",
	"red":     "#ff0000",
	"green":   "#008000",
	"blue":    "#0000ff",
	"yellow":  "#ffff00",
	"cyan":    "#00ffff",
	"magenta": "#ff00ff",
	"silver":  "#c0c0c0",
	"gray":    "#808080",
	"grey":    "#808080",
	"maroon":  "#800000",
	"olive":   "#808000",
	"lime":    "#00ff00",
	"aqua":    "#00ffff",
	"teal":    "#008080",
	"navy":    "#000080",
	"fuchsia": "#ff00ff",
	"purple":  "#800080",
	"orange":  "#ffa500",
}

// ParseColor parses a CSS color string into a Color.
// Supported formats: #hex (3, 4, 6, or 8 digits), rgb(), rgba(), and CSS named colors.
func ParseColor(s string) (Color, error) {
	s = strings.TrimSpace(strings.ToLower(s))

	// Named colors
	if hex, ok := namedColors[s]; ok {
		return parseHex(hex)
	}

	// Hex format
	if strings.HasPrefix(s, "#") {
		return parseHex(s)
	}

	// rgba() format - check before rgb() since rgba starts with rgb
	if strings.HasPrefix(s, "rgba(") && strings.HasSuffix(s, ")") {
		return parseRGBA(s)
	}

	// rgb() format
	if strings.HasPrefix(s, "rgb(") && strings.HasSuffix(s, ")") {
		return parseRGB(s)
	}

	return Color{}, fmt.Errorf("unsupported color format: %q", s)
}

func parseHex(s string) (Color, error) {
	s = strings.TrimPrefix(s, "#")

	switch len(s) {
	case 3:
		// #RGB -> #RRGGBB
		r, err := strconv.ParseUint(string(s[0])+string(s[0]), 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		g, err := strconv.ParseUint(string(s[1])+string(s[1]), 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		b, err := strconv.ParseUint(string(s[2])+string(s[2]), 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		return Color{R: float64(r) / 255, G: float64(g) / 255, B: float64(b) / 255, A: 1}, nil

	case 4:
		// #RGBA -> #RRGGBBAA
		r, err := strconv.ParseUint(string(s[0])+string(s[0]), 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		g, err := strconv.ParseUint(string(s[1])+string(s[1]), 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		b, err := strconv.ParseUint(string(s[2])+string(s[2]), 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		a, err := strconv.ParseUint(string(s[3])+string(s[3]), 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		return Color{R: float64(r) / 255, G: float64(g) / 255, B: float64(b) / 255, A: float64(a) / 255}, nil

	case 6:
		// #RRGGBB
		r, err := strconv.ParseUint(s[0:2], 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		g, err := strconv.ParseUint(s[2:4], 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		b, err := strconv.ParseUint(s[4:6], 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		return Color{R: float64(r) / 255, G: float64(g) / 255, B: float64(b) / 255, A: 1}, nil

	case 8:
		// #RRGGBBAA
		r, err := strconv.ParseUint(s[0:2], 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		g, err := strconv.ParseUint(s[2:4], 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		b, err := strconv.ParseUint(s[4:6], 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		a, err := strconv.ParseUint(s[6:8], 16, 8)
		if err != nil {
			return Color{}, fmt.Errorf("invalid hex color: %q", s)
		}
		return Color{R: float64(r) / 255, G: float64(g) / 255, B: float64(b) / 255, A: float64(a) / 255}, nil

	default:
		return Color{}, fmt.Errorf("invalid hex color length: %q", s)
	}
}

func parseRGB(s string) (Color, error) {
	inner := strings.TrimPrefix(s, "rgb(")
	inner = strings.TrimSuffix(inner, ")")
	parts := strings.Split(inner, ",")
	if len(parts) != 3 {
		return Color{}, fmt.Errorf("invalid rgb() format: %q", s)
	}

	r, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	if err != nil {
		return Color{}, fmt.Errorf("invalid rgb() red value: %w", err)
	}
	g, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err != nil {
		return Color{}, fmt.Errorf("invalid rgb() green value: %w", err)
	}
	b, err := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
	if err != nil {
		return Color{}, fmt.Errorf("invalid rgb() blue value: %w", err)
	}

	return Color{R: r / 255, G: g / 255, B: b / 255, A: 1}, nil
}

func parseRGBA(s string) (Color, error) {
	inner := strings.TrimPrefix(s, "rgba(")
	inner = strings.TrimSuffix(inner, ")")
	parts := strings.Split(inner, ",")
	if len(parts) != 4 {
		return Color{}, fmt.Errorf("invalid rgba() format: %q", s)
	}

	r, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	if err != nil {
		return Color{}, fmt.Errorf("invalid rgba() red value: %w", err)
	}
	g, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err != nil {
		return Color{}, fmt.Errorf("invalid rgba() green value: %w", err)
	}
	b, err := strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
	if err != nil {
		return Color{}, fmt.Errorf("invalid rgba() blue value: %w", err)
	}
	a, err := strconv.ParseFloat(strings.TrimSpace(parts[3]), 64)
	if err != nil {
		return Color{}, fmt.Errorf("invalid rgba() alpha value: %w", err)
	}

	return Color{R: r / 255, G: g / 255, B: b / 255, A: a}, nil
}
