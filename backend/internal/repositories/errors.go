package repositories

import "errors"

type repoErrors struct {
	NotFound     error
	LimitReached error
	Forbidden    error
}

var RepoErrors = repoErrors{
	NotFound:     errors.New("not found"),
	LimitReached: errors.New("public notes limit reached, please sign in"),
	Forbidden:    errors.New("forbidden"),
}
