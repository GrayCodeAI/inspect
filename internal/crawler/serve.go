package crawler

import (
	"context"
	"net"
	"net/http"
)

// ServeDir starts a temporary HTTP file server for the given directory.
// Returns the server and its address (host:port). The caller must call
// srv.Close() when done.
func ServeDir(ctx context.Context, dir string) (*http.Server, string, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, "", err
	}

	srv := &http.Server{
		Handler: http.FileServer(http.Dir(dir)),
	}

	go srv.Serve(listener)

	return srv, listener.Addr().String(), nil
}
